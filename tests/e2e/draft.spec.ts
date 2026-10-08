import { gunzipSync } from "node:zlib";
import { type Browser, type Page, expect, test } from "@playwright/test";
import { afterPick, nextTurn, snakeOrder } from "../../src/modules/botc/lib/draft/engine";
import { draftModes, fits, type PoolState } from "../../src/modules/botc/lib/draft/modes";
import { buildOptions, matchRoleId, parseBundles, roleIdsFromScriptJson } from "../../src/modules/botc/lib/draft/roles";
import { adminLogin, createAdminUser, resetDb, sql } from "./helpers";

/** The script in a script tool link (`?script=` is the JSON gzipped and base64-encoded). */
function toolScript(href: string) {
  return JSON.parse(gunzipSync(Buffer.from(new URL(href).searchParams.get("script")!, "base64")).toString("utf8"));
}

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

/** The draft on the page, and its run (draft_sessions), which the events and picks belong to. */
async function draftFromUrl(page: Page) {
  await page.waitForURL(/\/admin\/botc\/drafty\/\d+$/);
  const draftId = Number(page.url().split("/").pop());
  const [{ id: sessionId }] = await sql<{ id: number }>("select id from draft_sessions where draft_id=$1", [draftId]);
  return { draftId, sessionId };
}

const SCRIPT = [{ id: "_meta", name: "Test" }, "washerwoman", "librarian", "investigator", "chef", "empath", "choirboy", "king", "huntsman", "damsel", "imp", "poisoner", "drunk"];

/** Sets up a draft through the form: hand-picked characters from a script's JSON, a mode and its size. */
async function newDraft(page: Page, name: string, mode: "personal" | "shared", size: string, roles: unknown[] = SCRIPT) {
  await page.goto("/admin/botc/drafty/novy");
  await page.fill("#name", name);
  await page.selectOption("#mode", mode);
  await page.fill(mode === "personal" ? "[id='personal.rolesPerParticipant']" : "[id='shared.targetRoles']", size);
  await page.check("text=Ruční výběr");
  await page.click("summary:has-text('Načíst postavy ze scriptu')");
  await page.fill("textarea[aria-label='Načíst postavy ze scriptu']", JSON.stringify(roles));
  await page.click("button:has-text('Načíst')");
  await page.click("button:has-text('Vytvořit draft')");
  return draftFromUrl(page);
}

async function invite(page: Page, nickname: string) {
  await page.check(`[data-testid=draft-invite] label:has-text('${nickname}') input`);
  await page.click("[data-testid=draft-invite] button:has-text('Pozvat')");
  await expect(page.locator("main")).toContainText(`Pozváno: ${nickname}`);
}

test("draft: invitations, snake turns over days, a race of two tabs, bundles, completion and a script from the pool", async ({ page, browser }) => {
  await account("Alice", "alice@example.com", "admin");
  await account("Bob", "bob@example.com");
  await account("Charlie", "charlie@example.com");
  await adminLogin(page, { email: "alice@example.com", password: PASSWORD });

  // a draft is set up in one go: mode, size, characters (from a script's JSON) and the two default bundles
  await page.goto("/admin/botc/drafty");
  await page.click("text=+ Nový draft");
  await page.fill("#name", "Podzimní draft");
  await expect(page.locator("#mode")).toHaveValue("personal");
  await page.fill("[id='personal.rolesPerParticipant']", "3");
  await page.check("text=Ruční výběr");
  await page.click("summary:has-text('Načíst postavy ze scriptu')");
  await page.fill("textarea[aria-label='Načíst postavy ze scriptu']", JSON.stringify(SCRIPT));
  await page.click("button:has-text('Načíst')");
  await expect(page.getByTestId("offered-count")).toHaveText("Nabízí se 12 postav.");
  await expect(page.locator("#bundles")).toHaveValue("Choirboy + King\nHuntsman + Damsel");
  await page.click("button:has-text('Vytvořit draft')");
  const { draftId, sessionId } = await draftFromUrl(page);
  await expect(page.locator("h1")).toContainText("Podzimní draft");
  await expect(page.locator("main")).toContainText("Personal Pool · 3 role na hráče");
  await expect(page.getByTestId("start-checks")).toContainText("Draftujících: 1 – potřeba aspoň 2");
  await expect(page.getByTestId("start-checks")).toContainText("✅Nabídka: 12 postav");

  // Bob is invited, Charlie is not
  await invite(page, "Bob");
  await expect(page.getByTestId("member-Bob")).toContainText("pozvánka odeslaná");
  await expect(page.getByTestId("start-checks")).toContainText("Ještě neodpověděli: Bob");
  await expect(page.locator("h1")).toContainText("Čeká se na hráče");
  // the invitation went out through the outbox
  await expect
    .poll(async () => sql("select type, dispatched_at is not null as sent from draft_events where session_id=$1", [sessionId]))
    .toEqual([{ type: "invited", sent: true }]);

  // Charlie is not a member: the draft does not exist for him
  const charlie = await loginAs(browser, "charlie@example.com");
  const notFound = await charlie.goto(`/admin/botc/drafty/${draftId}`);
  expect(notFound?.status()).toBe(404);
  await charlie.goto("/admin/botc/drafty");
  await expect(charlie.getByTestId("drafts")).not.toContainText("Podzimní draft");

  // Bob sees the invitation in the menu and accepts it
  const bob = await loginAs(browser, "bob@example.com");
  await expect(bob.getByTestId("draft-badge")).toHaveText("1");
  await bob.click("main nav >> text=Drafty");
  await expect(bob.getByTestId("drafts")).toContainText("Pozvánka čeká na tvou odpověď");
  await bob.click("[data-testid=drafts] a");
  await bob.click("#invitation button:has-text('Přijmout')");
  await expect(bob.getByTestId("member-Bob")).toContainText("přijal/a");

  // Alice starts it; from now on the order and the settings are fixed
  await page.reload();
  await expect(page.locator("h1")).toContainText("Připraveno ke startu");
  page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('Spustit draft')");
  await expect(page.locator("#turn")).toContainText("JSI NA TAHU");
  await expect(page.locator("#turn")).toContainText("Pick č. 1");
  await expect(page.locator("#turn")).toContainText("Tvůj pool: 0 / 3");
  // hard to miss: the browser tab says so too, and a button jumps to the offer
  await expect(page).toHaveTitle(/^🎯 Jsi na tahu · /);
  await expect(page.locator("#turn a:has-text('Vybrat ↓')")).toHaveAttribute("href", "#pick");
  await expect(page.getByTestId("order")).toHaveText(/1\. Alice.*2\. Bob/);
  await expect(page.locator("button:has-text('Uložit nastavení')")).toHaveCount(0);
  // every team in a box of its own; the bundles first
  await expect(page.locator('[data-testid=pick-board] [data-team=demon] [data-option="imp"]')).toHaveCount(1);
  await expect(page.locator('[data-testid=pick-board] [data-team=outsider] [data-option="drunk"]')).toHaveCount(1);
  await expect(page.locator("[data-testid=pick-board] [data-team]").first()).toHaveAttribute("data-team", "bundles");

  // pick 1: Alice. Selecting is not picking – only the confirmation saves it
  await page.click('[data-testid=pick-board] button[data-option="washerwoman"]');
  expect(await sql("select count(*)::int as c from draft_picks")).toEqual([{ c: 0 }]);
  await page.click("button:has-text('Potvrdit pick')");
  await expect(page.locator("main")).toContainText("Vybráno: Pradlena.");
  await expect(page.locator("#turn")).toContainText("Čeká se na Bob");
  await expect(page).not.toHaveTitle(/Jsi na tahu/);

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
  await page.goto("/admin/botc/drafty");
  await expect.poll(turnEvents).toEqual([
    { pick_number: 1, sent: true, recipients: 0, later: false },
    { pick_number: 2, sent: true, recipients: 1, later: false },
  ]);
  await page.goto(`/admin/botc/drafty/${draftId}`);

  // nobody needs to be online: Bob comes back later, the server knows where the draft is
  await bob.goto("/admin/botc/drafty");
  await expect(bob.getByTestId("draft-badge")).toHaveText("1");
  await expect(bob.getByTestId("drafts")).toContainText("JSI NA TAHU");
  // the address from the e-mails sent before drafts and sessions became one leads to the draft
  await bob.goto(`/admin/botc/drafty/session/${sessionId}`);
  await expect(bob).toHaveURL(new RegExp(`/admin/botc/drafty/${draftId}$`));
  await expect(bob.locator("#turn")).toContainText("Pick č. 2");
  // Washerwoman is gone for everybody in this draft
  await expect(bob.locator('[data-testid=pick-board] [data-option="washerwoman"]')).toHaveCount(0);

  // pick 2 from two tabs at once: exactly one gets through, the other is told the draft moved on
  const bob2 = await bob.context().newPage();
  await bob2.goto(`/admin/botc/drafty/${draftId}`);
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
  // the pool so far opens in the script tool already mid-draft
  const poolLinks = await page.getByTestId("pools").locator("a:has-text('Otevřít ve script toolu')").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(poolLinks).toHaveLength(2);
  expect(poolLinks.map(toolScript)).toContainEqual([{ id: "_meta", name: "Podzimní draft – Alice", author: "Alice" }, "librarian", "washerwoman"]);
  await expect(page.locator('[data-testid=pick-board] button[data-option="choirboy+king"]')).toHaveCount(0);
  await expect(page.locator('[data-testid=pick-board] span[data-option="choirboy+king"]')).toHaveCount(1);
  await pick(page, "chef");

  // all pools full: over, locked, every pick in the history; the pools split by team
  await expect(page.locator("h1")).toContainText("Dokončeno");
  await expect(page.getByTestId("pools")).toContainText("Alice3 / 3");
  await expect(page.getByTestId("pools")).toContainText("Bob3 / 3");
  await expect(page.locator("[data-testid=pools] [data-team=outsider]")).toContainText("Kráska");
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
  await page.waitForURL(/\/admin\/botc\/drafty\/script\/\d+$/);
  const scriptId = Number(page.url().split("/").pop());
  await expect(page.locator("#name")).toHaveValue("Podzimní draft – Alice");
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
  const json = await page.request.get(`/admin/botc/drafty/script/${scriptId}/script.json`);
  expect(await json.json()).toEqual([{ id: "_meta", name: "Alicin script", author: "Alice" }, "librarian", "washerwoman"]);

  // into the club's library as a copy of the saved script; saving it again updates that copy
  await page.reload(); // without the forged checkbox
  await page.click("button:has-text('Uložit do knihovny')");
  await expect(page.locator("main")).toContainText("Script je v knihovně");
  const [copy] = await sql<{ id: number; name: string; author: string; role_ids: string[]; json: string; created_by: number }>(
    "select id, name, author, role_ids, json, created_by from scripts",
  );
  expect(copy).toMatchObject({ name: "Alicin script", author: "Alice", role_ids: ["librarian", "washerwoman"] });
  expect(JSON.parse(copy.json)).toEqual([{ id: "_meta", name: "Alicin script", author: "Alice" }, "librarian", "washerwoman"]);
  await expect(page.locator("a:has-text('V knihovně scriptů')")).toHaveAttribute("href", `/admin/botc/scripty/${copy.id}`);
  await page.fill("#name", "Alicin podzim");
  await page.click("button:has-text('Uložit script')");
  await expect(page.locator("main")).toContainText("Uloženo.");
  await page.click("button:has-text('Aktualizovat v knihovně')");
  await expect(page.locator("main")).toContainText("Script v knihovně je aktualizovaný.");
  expect(await sql("select id, name from scripts")).toEqual([{ id: copy.id, name: "Alicin podzim" }]);
  // a name another library script has is refused; the copy stays as it was
  await sql("insert into scripts (name, json, role_ids) values ('Zabraný', '[]', '[]')");
  await page.fill("#name", "zabraný");
  await page.click("button:has-text('Uložit script')");
  await expect(page.locator("main")).toContainText("Uloženo.");
  await page.click("button:has-text('Aktualizovat v knihovně')");
  await expect(page.locator("main")).toContainText("V knihovně už je jiný script se stejným názvem");
  expect(await sql("select name from scripts where id=$1", [copy.id])).toEqual([{ name: "Alicin podzim" }]);
  await page.click("text=← Zpět na draft");
  await expect(page).toHaveURL(new RegExp(`/admin/botc/drafty/${draftId}$`));

  // Bob sees Alice's script but cannot edit it; he cannot make one from her pool
  await bob.goto(`/admin/botc/drafty/script/${scriptId}`);
  await expect(bob.locator("main")).toContainText("Upravit ho může jen jeho autor.");
  await expect(bob.getByTestId("script-form")).toHaveCount(0);
  await expect(bob.locator("a:has-text('V knihovně scriptů')")).toHaveCount(1);
  await expect(bob.locator("button:has-text('knihovn')")).toHaveCount(0);
  await bob.goto(`/admin/botc/drafty/${draftId}`);
  await expect(bob.locator("button:has-text('Vytvořit script')")).toHaveCount(1);
  await charlie.context().close();
  await bob.context().close();
});

test("draft: two drafts are independent – own members, picks, snapshot – settings change until the start, Shared Pool ends at its size", async ({ page, browser }) => {
  await account("Alice", "alice@example.com", "admin");
  const bobId = await account("Bob", "bob@example.com");
  const charlieId = await account("Charlie", "charlie@example.com");
  await adminLogin(page, { email: "alice@example.com", password: PASSWORD });
  const roles = ["washerwoman", "chef", "empath", "monk", "imp", "poisoner"];

  const shared = await newDraft(page, "Páteční shared", "shared", "3", roles);
  await invite(page, "Bob");
  const personal = await newDraft(page, "Páteční personal", "personal", "2", roles);
  await invite(page, "Charlie");
  // the settings change until the start: 1 character each instead of 2
  await expect(page.locator("main")).toContainText("2 role na hráče");
  await page.fill("[id='personal.rolesPerParticipant']", "1");
  await page.click("button:has-text('Uložit nastavení')");
  await expect(page.locator("main")).toContainText("Uloženo.");
  await page.reload();
  await expect(page.locator("main")).toContainText("1 role na hráče");
  await sql("update draft_session_members set status='accepted' where user_id = any($1)", [[bobId, charlieId]]);

  // Bob is in the first draft only: the list shows him just that one, the other does not exist for him
  const bob = await loginAs(browser, "bob@example.com");
  await bob.goto("/admin/botc/drafty");
  await expect(bob.getByTestId("drafts")).toContainText("Páteční shared");
  await expect(bob.getByTestId("drafts")).not.toContainText("Páteční personal");
  expect((await bob.goto(`/admin/botc/drafty/${personal.draftId}`))?.status()).toBe(404);

  for (const d of [shared, personal]) {
    await page.goto(`/admin/botc/drafty/${d.draftId}`);
    page.once("dialog", (dialog) => dialog.accept());
    await page.click("button:has-text('Spustit draft')");
    await expect(page.locator("#turn")).toContainText("JSI NA TAHU");
  }
  // a later change of the setup does not reach a draft that already started
  await sql("update drafts set role_source=$1", [JSON.stringify({ kind: "manual", roleIds: ["washerwoman"] })]);

  // the Imp picked in the first draft is still there in the second
  await page.goto(`/admin/botc/drafty/${shared.draftId}`);
  await expect(page.locator("#turn")).toContainText("Společný pool: 0 / 3");
  await pick(page, "imp");
  await expect(page.locator("#turn")).toContainText("Čeká se na Bob");
  await page.goto(`/admin/botc/drafty/${personal.draftId}`);
  await expect(page.locator('[data-testid=pick-board] button[data-option="imp"]')).toHaveCount(1);
  await pick(page, "imp");
  await expect(page.locator("#turn")).toContainText("Čeká se na Charlie");

  // Bob picks twice (end of the row) and the shared pool is full: over
  await bob.goto(`/admin/botc/drafty/${shared.draftId}`);
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
  await bob.goto("/admin/botc/drafty");
  await expect(bob.getByTestId("drafts")).toContainText("3 / 3 roles");

  // the second draft goes on on its own
  await page.reload();
  await expect(page.locator("h1")).toContainText("Probíhá");
  expect(await sql("select session_id, count(*)::int as c from draft_picks group by session_id order by session_id")).toEqual([
    { session_id: shared.sessionId, c: 3 },
    { session_id: personal.sessionId, c: 1 },
  ]);
  await bob.context().close();
});
