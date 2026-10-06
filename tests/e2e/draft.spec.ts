import { type Browser, type Page, expect, test } from "@playwright/test";
import { afterPick, nextTurn, snakeOrder } from "../../src/lib/draft/engine";
import { draftModes, fits, type PoolState } from "../../src/lib/draft/modes";
import { buildOptions, matchRoleId, parseBundles, roleIdsFromScriptJson } from "../../src/lib/draft/roles";
import { adminLogin, createAdminUser, resetDb, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
});

// ─── pure logic ──────────────────────────────────────────────────────────────

test("snake order: 1 → N, N → 1, the end drafter picks twice", () => {
  expect(snakeOrder(4, 12)).toEqual([0, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 3]);
  expect(snakeOrder(2, 6)).toEqual([0, 1, 1, 0, 0, 1]);
  // a full pool is skipped, and the snake goes on in its direction
  expect(nextTurn({ seat: 1, direction: 1 }, 4, (s) => s !== 2)).toEqual({ seat: 3, direction: 1 });
  expect(nextTurn({ seat: 3, direction: 1 }, 4, (s) => s !== 3)).toEqual({ seat: 2, direction: -1 });
  // nobody can pick any more
  expect(nextTurn({ seat: 0, direction: 1 }, 3, () => false)).toBeNull();
});

test("bundles: one pick for all their characters, never split, data not code", () => {
  const roles = ["washerwoman", "choirboy", "king", "huntsman", "damsel", "imp"];
  const { options, incompleteBundles } = buildOptions(roles, [["king", "choirboy"], ["damsel", "huntsman"]]);
  expect(options.map((o) => o.roleIds)).toEqual([["choirboy", "king"], ["huntsman", "damsel"], ["washerwoman"], ["imp"]]);
  expect(incompleteBundles).toEqual([]);
  // without the King the Choirboy is not offered alone
  const partial = buildOptions(["washerwoman", "choirboy", "imp"], [["choirboy", "king"]]);
  expect(partial.options.map((o) => o.roleIds)).toEqual([["washerwoman"], ["imp"]]);
  expect(partial.incompleteBundles).toEqual([{ roleIds: ["choirboy", "king"], missing: ["king"] }]);
  // any characters can be a bundle
  expect(buildOptions(["imp", "baron"], [["baron", "imp"]]).options).toEqual([{ roleIds: ["baron", "imp"] }]);
  expect(parseBundles("Choirboy + King\nLovec, damsel\nnobody + Imp")).toEqual({
    bundles: [["choirboy", "king"], ["huntsman", "damsel"], ["imp"]],
    unknown: ["nobody"],
  });
});

test("pool limits: a two-character bundle does not fit 14 / 15; modes decide the end", () => {
  const pool: PoolState = { id: 1, memberId: 1, target: 15, count: 14 };
  expect(fits(pool, 2)).toBe(false);
  expect(fits(pool, 1)).toBe(true);
  const personal = draftModes.personal;
  // Alice is full, Bob has 14/15 and only a bundle is left: nobody can pick → over
  const pools: PoolState[] = [
    { id: 1, memberId: 1, target: 15, count: 15 },
    { id: 2, memberId: 2, target: 15, count: 14 },
  ];
  expect(afterPick(personal, { seat: 0, direction: 1 }, [1, 2], pools, [{ id: 9, roleIds: ["choirboy", "king"] }])).toEqual({
    kind: "completed",
    exhausted: true,
  });
  // with a single left, Bob goes on
  expect(afterPick(personal, { seat: 0, direction: 1 }, [1, 2], pools, [{ id: 8, roleIds: ["imp"] }])).toEqual({
    kind: "next",
    turn: { seat: 1, direction: 1 },
    memberId: 2,
  });
  // shared: over once the one pool has its target
  expect(draftModes.shared.isComplete([{ id: 1, memberId: null, target: 30, count: 30 }])).toBe(true);
  expect(draftModes.shared.isComplete([{ id: 1, memberId: null, target: 30, count: 29 }])).toBe(false);
});

test("characters from names, old ids and script JSON", () => {
  expect(matchRoleId("Fortune Teller")).toBe("fortuneteller");
  expect(matchRoleId("fortune_teller")).toBe("fortuneteller");
  expect(matchRoleId("Vědma")).toBe("fortuneteller");
  expect(matchRoleId("nobody")).toBeNull();
  expect(roleIdsFromScriptJson('[{"id":"_meta","name":"X"},"imp",{"id":"washerwoman"},"djinn","homebrew"]')).toEqual(["washerwoman", "imp"]);
  expect(roleIdsFromScriptJson("not json")).toBeNull();
});

// ─── end to end ──────────────────────────────────────────────────────────────

const PASSWORD = "heslo-pro-draft";

async function account(nickname: string, email: string, role: "admin" | "organizer" = "organizer") {
  return createAdminUser({ nickname, email, password: PASSWORD, role });
}

async function loginAs(browser: Browser, email: string) {
  const ctx = await browser.newContext({ locale: "cs-CZ" });
  const page = await ctx.newPage();
  await adminLogin(page, { email, password: PASSWORD });
  return page;
}

/** Selects an option on the pick board and confirms it. */
async function pick(page: Page, option: string) {
  await page.click(`[data-testid=pick-board] button[data-option="${option}"]`);
  await page.click("button:has-text('Potvrdit pick')");
}

async function sessionIdFromUrl(page: Page) {
  await page.waitForURL(/\/admin\/drafty\/session\/\d+$/);
  return Number(page.url().split("/").pop());
}

test("draft: invitations, snake turns over days, a race of two tabs, bundles, completion and a script from the pool", async ({ page, browser }) => {
  await account("Alice", "alice@example.com", "admin");
  await account("Bob", "bob@example.com");
  await account("Charlie", "charlie@example.com");
  await adminLogin(page, { email: "alice@example.com", password: PASSWORD });

  // a Draft with characters taken from a script's JSON; the two default bundles
  await page.goto("/admin/drafty");
  await page.click("text=+ Nový draft");
  await page.fill("#name", "Podzimní draft");
  await page.check("text=Ruční výběr");
  await page.click("summary:has-text('Načíst postavy ze scriptu')");
  await page.fill(
    "textarea[aria-label='Načíst postavy ze scriptu']",
    JSON.stringify([{ id: "_meta", name: "Test" }, "washerwoman", "librarian", "investigator", "chef", "empath", "choirboy", "king", "huntsman", "damsel", "imp", "poisoner", "drunk"]),
  );
  await page.click("button:has-text('Načíst')");
  await expect(page.getByTestId("offered-count")).toHaveText("Nabízí se 12 postav.");
  await expect(page.locator("#bundles")).toHaveValue("Choirboy + King\nHuntsman + Damsel");
  await page.click("button:has-text('Vytvořit draft')");
  await page.waitForURL(/\/admin\/drafty\/\d+$/);
  await expect(page.locator("main")).toContainText("Nabízí se 12 postav.");

  // a session: Personal Pool, 3 characters each
  await page.fill("#session-name", "Session A");
  await page.fill("[id='session-personal.rolesPerParticipant']", "3");
  await page.click("button:has-text('Vytvořit session')");
  const sessionId = await sessionIdFromUrl(page);
  await expect(page.getByTestId("start-checks")).toContainText("Draftujících: 1 – potřeba aspoň 2");

  // invitations are per session: Bob is invited, Charlie is not
  await page.check("[data-testid=draft-invite] label:has-text('Bob') input");
  await page.click("[data-testid=draft-invite] button:has-text('Pozvat')");
  await expect(page.locator("main")).toContainText("Pozváno: Bob");
  await expect(page.getByTestId("member-Bob")).toContainText("pozvánka odeslaná");
  await expect(page.getByTestId("start-checks")).toContainText("Ještě neodpověděli: Bob");
  await expect(page.locator("h1")).toContainText("Čeká se na hráče");
  // the invitation went out through the outbox
  await expect
    .poll(async () => sql("select type, dispatched_at is not null as sent from draft_events where session_id=$1", [sessionId]))
    .toEqual([{ type: "invited", sent: true }]);

  // Charlie is not a member: the session does not exist for him
  const charlie = await loginAs(browser, "charlie@example.com");
  const notFound = await charlie.goto(`/admin/drafty/session/${sessionId}`);
  expect(notFound?.status()).toBe(404);

  // Bob sees the invitation in the menu and accepts it
  const bob = await loginAs(browser, "bob@example.com");
  await expect(bob.getByTestId("draft-badge")).toHaveText("1");
  await bob.click("main nav >> text=Drafty");
  await expect(bob.getByTestId("my-sessions")).toContainText("Pozvánka čeká na tvou odpověď");
  await bob.click("[data-testid=my-sessions] a");
  await bob.click("#invitation button:has-text('Přijmout')");
  await expect(bob.getByTestId("member-Bob")).toContainText("přijal/a");

  // Alice starts it; from now on the order is fixed
  await page.reload();
  await expect(page.locator("h1")).toContainText("Připraveno ke startu");
  page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('Spustit draft')");
  await expect(page.locator("#turn")).toContainText("JSI NA TAHU");
  await expect(page.locator("#turn")).toContainText("Pick č. 1");
  await expect(page.locator("#turn")).toContainText("Tvůj pool: 0 / 3");
  await expect(page.getByTestId("order")).toHaveText(/1\. Alice.*2\. Bob/);

  // pick 1: Alice. Selecting is not picking – only the confirmation saves it
  await page.click('[data-testid=pick-board] button[data-option="washerwoman"]');
  expect(await sql("select count(*)::int as c from draft_picks")).toEqual([{ c: 0 }]);
  await page.click("button:has-text('Potvrdit pick')");
  await expect(page.locator("main")).toContainText("Vybráno: Pradlena.");
  await expect(page.locator("#turn")).toContainText("Čeká se na Bob");

  // no e-mail for a new turn: a reminder only once the drafter has not picked for a day
  const turnEvents = () =>
    sql<{ pick_number: number; sent: boolean; recipients: number | null; later: boolean }>(
      `select pick_number, dispatched_at is not null as sent, recipients, due_at > now() + interval '23 hours' as later
       from draft_events where session_id=$1 and type='turn' order by id`,
      [sessionId],
    );
  expect(await turnEvents()).toEqual([
    { pick_number: 1, sent: false, recipients: null, later: true },
    { pick_number: 2, sent: false, recipients: null, later: true },
  ]);
  // a day passes; any admin page sends what came due: Alice picked in time (nobody), Bob is still on turn
  await sql("update draft_events set due_at = now() - interval '1 minute' where session_id=$1 and type='turn'", [sessionId]);
  await page.goto("/admin/drafty");
  await expect.poll(turnEvents).toEqual([
    { pick_number: 1, sent: true, recipients: 0, later: false },
    { pick_number: 2, sent: true, recipients: 1, later: false },
  ]);
  await page.goto(`/admin/drafty/session/${sessionId}`);

  // nobody needs to be online: Bob comes back later, the server knows where the draft is
  await bob.goto("/admin/drafty");
  await expect(bob.getByTestId("draft-badge")).toHaveText("1");
  await expect(bob.getByTestId("my-sessions")).toContainText("JSI NA TAHU");
  await bob.goto(`/admin/drafty/session/${sessionId}`);
  await expect(bob.locator("#turn")).toContainText("Pick č. 2");
  // Washerwoman is gone for everybody in this session
  await expect(bob.locator('[data-testid=pick-board] [data-option="washerwoman"]')).toHaveCount(0);

  // pick 2 from two tabs at once: exactly one gets through, the other is told the draft moved on
  const bob2 = await bob.context().newPage();
  await bob2.goto(`/admin/drafty/session/${sessionId}`);
  await bob.click('[data-testid=pick-board] button[data-option="imp"]');
  await bob2.click('[data-testid=pick-board] button[data-option="poisoner"]');
  await Promise.all([bob.click("button:has-text('Potvrdit pick')"), bob2.click("button:has-text('Potvrdit pick')")]);
  await expect(async () => {
    const texts = [await bob.locator("main").textContent(), await bob2.locator("main").textContent()];
    expect(texts.filter((x) => x?.includes("Mezitím proběhl jiný pick"))).toHaveLength(1);
  }).toPass();
  const afterRace = await sql<{ pick_number: number; role_ids: string[] }>("select pick_number, role_ids from draft_picks order by pick_number");
  expect(afterRace.map((p) => p.pick_number)).toEqual([1, 2]);
  const raced = afterRace[1].role_ids[0];
  expect(["imp", "poisoner"]).toContain(raced);

  // the end of the row: Bob again (pick 3), direction back
  await bob.reload();
  await expect(bob.locator("#turn")).toContainText("JSI NA TAHU");
  await expect(bob.locator("#turn")).toContainText("Pick č. 3");
  await expect(bob.locator("#turn")).toContainText("← zpět");
  await pick(bob, "huntsman+damsel");
  await expect(bob.locator("main")).toContainText("Vybráno: Lovec + Kráska.");
  await expect(bob.locator("#turn")).toContainText("Čeká se na Alice");

  // Alice: pick 4, then pick 5 again (the other end); 2 / 3 leaves no room for a bundle
  await page.reload();
  await expect(page.locator("#turn")).toContainText("Pick č. 4");
  await pick(page, "librarian");
  await expect(page.locator("#turn")).toContainText("Pick č. 5");
  await expect(page.locator("#turn")).toContainText("Tvůj pool: 2 / 3");
  await expect(page.locator('[data-testid=pick-board] button[data-option="choirboy+king"]')).toHaveCount(0);
  await expect(page.locator('[data-testid=pick-board] span[data-option="choirboy+king"]')).toHaveCount(1);
  await pick(page, "chef");

  // all pools full: over, locked, every pick in the history
  await expect(page.locator("h1")).toContainText("Dokončeno");
  await expect(page.getByTestId("pools")).toContainText("Alice3 / 3");
  await expect(page.getByTestId("pools")).toContainText("Bob3 / 3");
  await expect(page.getByTestId("history").locator("tbody tr")).toHaveCount(5);
  expect(await sql("select status, current_member_id, pick_number from draft_sessions where id=$1", [sessionId])).toEqual([
    { status: "completed", current_member_id: null, pick_number: 6 },
  ]);
  // the end goes out at once to both; the turns after the reminder are not due yet (and would reach nobody)
  await expect
    .poll(async () =>
      sql("select type, pick_number, recipients, dispatched_at is not null as sent from draft_events where session_id=$1 order by id", [sessionId]),
    )
    .toEqual([
      { type: "invited", pick_number: null, recipients: 1, sent: true },
      { type: "turn", pick_number: 1, recipients: 0, sent: true },
      { type: "turn", pick_number: 2, recipients: 1, sent: true },
      { type: "turn", pick_number: 3, recipients: null, sent: false },
      { type: "turn", pick_number: 4, recipients: null, sent: false },
      { type: "turn", pick_number: 5, recipients: null, sent: false },
      { type: "completed", pick_number: null, recipients: 2, sent: true },
    ]);

  // a script from Alice's pool: only her characters, also when the form is tampered with
  await page.click("button:has-text('Vytvořit script')");
  await page.waitForURL(/\/admin\/drafty\/script\/\d+$/);
  const scriptId = Number(page.url().split("/").pop());
  await expect(page.getByTestId("script-form").locator("input[name=role]")).toHaveCount(3);
  await page.uncheck("[data-testid=script-form] input[value=chef]");
  await page.fill("#name", "Alicin script");
  await page.click("button:has-text('Uložit script')");
  await expect(page.locator("main")).toContainText("Uloženo.");
  expect(await sql("select name, role_ids from draft_scripts where id=$1", [scriptId])).toEqual([
    { name: "Alicin script", role_ids: ["librarian", "washerwoman"] },
  ]);
  await page.evaluate(() => {
    const box = document.createElement("input");
    Object.assign(box, { type: "checkbox", name: "role", value: "imp", checked: true });
    document.querySelector("[data-testid=script-form]")!.appendChild(box);
  });
  await page.click("button:has-text('Uložit script')");
  await expect(page.locator("main")).toContainText("Script smí obsahovat jen postavy z poolu.");
  expect(await sql("select role_ids from draft_scripts where id=$1", [scriptId])).toEqual([{ role_ids: ["librarian", "washerwoman"] }]);

  // it opens in the club's script tool and downloads as the official JSON
  const toolLink = await page.locator("a:has-text('Otevřít ve script toolu')").getAttribute("href");
  expect(toolLink).toMatch(/^https:\/\/botcscript\.app\/\?script=/);
  const json = await page.request.get(`/admin/drafty/script/${scriptId}/script.json`);
  expect(await json.json()).toEqual([{ id: "_meta", name: "Alicin script", author: "Alice" }, "librarian", "washerwoman"]);

  // Bob sees Alice's script but cannot edit it; he cannot make one from her pool
  await bob.goto(`/admin/drafty/script/${scriptId}`);
  await expect(bob.locator("main")).toContainText("Upravit ho může jen jeho autor.");
  await expect(bob.getByTestId("script-form")).toHaveCount(0);
  await bob.goto(`/admin/drafty/session/${sessionId}`);
  await expect(bob.locator("button:has-text('Vytvořit script')")).toHaveCount(1);
  await charlie.context().close();
  await bob.context().close();
});

test("draft: sessions of one Draft are independent – own members, picks, snapshot – and Shared Pool ends at its size", async ({ page, browser }) => {
  const alice = await account("Alice", "alice@example.com", "admin");
  const bobId = await account("Bob", "bob@example.com");
  const charlieId = await account("Charlie", "charlie@example.com");
  const [{ id: draftId }] = await sql<{ id: number }>(
    `insert into drafts (name, owner_id, role_source, bundles, modes, mode_defaults)
     values ('Páteční draft', $1, $2, '[]', '["personal","shared"]', '{}') returning id`,
    [alice, JSON.stringify({ kind: "manual", roleIds: ["washerwoman", "chef", "empath", "monk", "imp", "poisoner"] })],
  );
  await adminLogin(page, { email: "alice@example.com", password: PASSWORD });

  const newSession = async (name: string, mode: "personal" | "shared", size: string, invite: string) => {
    await page.goto(`/admin/drafty/${draftId}`);
    await page.fill("#session-name", name);
    await page.selectOption("#session-mode", mode);
    await page.fill(mode === "personal" ? "[id='session-personal.rolesPerParticipant']" : "[id='session-shared.targetRoles']", size);
    await page.click("button:has-text('Vytvořit session')");
    const id = await sessionIdFromUrl(page);
    await page.check(`[data-testid=draft-invite] label:has-text('${invite}') input`);
    await page.click("[data-testid=draft-invite] button:has-text('Pozvat')");
    await expect(page.locator("main")).toContainText(`Pozváno: ${invite}`);
    return id;
  };
  const s1 = await newSession("Shared", "shared", "3", "Bob");
  const s2 = await newSession("Personal", "personal", "1", "Charlie");
  await sql("update draft_session_members set status='accepted' where user_id = any($1)", [[bobId, charlieId]]);

  // Bob is in session 1 only: the Draft shows him just that one, session 2 does not exist for him
  const bob = await loginAs(browser, "bob@example.com");
  await bob.goto(`/admin/drafty/${draftId}`);
  await expect(bob.getByTestId("draft-sessions")).toContainText("Shared");
  await expect(bob.getByTestId("draft-sessions")).not.toContainText("Personal");
  expect((await bob.goto(`/admin/drafty/session/${s2}`))?.status()).toBe(404);

  for (const id of [s1, s2]) {
    await page.goto(`/admin/drafty/session/${id}`);
    page.once("dialog", (d) => d.accept());
    await page.click("button:has-text('Spustit draft')");
    await expect(page.locator("#turn")).toContainText("JSI NA TAHU");
  }
  // a later change of the Draft does not reach sessions that already started
  await sql("update drafts set role_source=$1 where id=$2", [JSON.stringify({ kind: "manual", roleIds: ["washerwoman"] }), draftId]);

  // the Imp picked in session 1 is still there in session 2
  await page.goto(`/admin/drafty/session/${s1}`);
  await expect(page.locator("#turn")).toContainText("Společný pool: 0 / 3");
  await pick(page, "imp");
  await expect(page.locator("#turn")).toContainText("Čeká se na Bob");
  await page.goto(`/admin/drafty/session/${s2}`);
  await expect(page.locator('[data-testid=pick-board] button[data-option="imp"]')).toHaveCount(1);
  await pick(page, "imp");
  await expect(page.locator("#turn")).toContainText("Čeká se na Charlie");

  // Bob picks twice (end of the row) and the shared pool is full: over
  await bob.goto(`/admin/drafty/session/${s1}`);
  await pick(bob, "chef");
  await expect(bob.locator("#turn")).toContainText("Společný pool: 2 / 3");
  await pick(bob, "monk");
  await expect(bob.locator("h1")).toContainText("Dokončeno");
  await expect(bob.getByTestId("pools")).toContainText("Společný pool3 / 3");

  // the same in English
  await bob.context().addCookies([{ name: "botc_lang", value: "en", url: new URL(bob.url()).origin }]);
  await bob.reload();
  await expect(bob.locator("h1")).toContainText("Completed");
  await expect(bob.getByTestId("pools")).toContainText("Shared pool3 / 3");
  await expect(bob.getByTestId("history")).toContainText("Monk");
  await bob.goto("/admin/drafty");
  await expect(bob.getByTestId("my-sessions")).toContainText("3 / 3 roles");

  // session 2 goes on on its own
  await page.reload();
  await expect(page.locator("h1")).toContainText("Probíhá");
  expect(await sql("select session_id, count(*)::int as c from draft_picks group by session_id order by session_id")).toEqual([
    { session_id: s1, c: 3 },
    { session_id: s2, c: 1 },
  ]);
  await bob.context().close();
});
