import { expect, test } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { adminLogin, createAdminUser, createSession, register, resetDb, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
});

test("home page lists sessions with free spots and full state", async ({ page }) => {
  const id = await createSession({ title: "Večer A", capacity: 2 });
  await page.goto("/botc");
  await expect(page.locator("main")).toContainText("Večer A");
  await expect(page.locator("main")).toContainText("2 volná místa z 2");
  await register(page, id, { nick: "A1", email: "a1@example.com" });
  await register(page, id, { nick: "A2", email: "a2@example.com" });
  await page.goto("/botc");
  await expect(page.locator("main")).toContainText("Plno");
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).toContainText("Termín je plný");
});

test("registration, duplicate handling, edit, cancel and re-registration", async ({ page }) => {
  const id = await createSession({ capacity: 2 });

  let text = await register(page, id, { first: "Anna", nick: "Anka", email: "Anna@Example.com", arrival: "19:30" });
  expect(text).toContain("Hotovo, jsi registrovaný");

  // duplicate e-mail with different case → no second row, "already registered"
  text = await register(page, id, { nick: "Anka2", email: "anna@example.com" });
  expect(text).toContain("už jsi registrovaný");
  const rows = await sql<{ c: number }>("select count(*)::int c from registrations");
  expect(rows[0].c).toBe(1);

  // last spot: success message must survive (no server re-render to "full")
  text = await register(page, id, { nick: "Bob", email: "bob@example.com" });
  expect(text).toContain("Hotovo, jsi registrovaný");

  // public nickname list shows nicknames but never e-mails
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).toContainText("Přihlášení (2)");
  await expect(page.locator("main")).toContainText("Anka");
  await expect(page.locator("main")).not.toContainText("example.com");

  // edit via token
  const [reg] = await sql<{ edit_token: string; arrival_time: string }>(
    "select edit_token, arrival_time from registrations where email='anna@example.com'",
  );
  expect(reg.arrival_time).toBe("19:30");
  await page.goto(`/r/${reg.edit_token}`);
  await page.fill("#nickname", "Anička");
  await page.selectOption("#departureTime", "22:00");
  // only times inside the session (19:00–23:00) are offered
  expect(await page.locator("#arrivalTime option").allTextContents()).toEqual(["Od začátku (19:00)", "19:15", "19:30", "19:45", "20:00", "20:15", "20:30", "20:45", "21:00", "21:15", "21:30", "21:45", "22:00", "22:15", "22:30", "22:45"]);
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("Změny uloženy");
  const [after] = await sql<{ nickname: string; departure_time: string }>(
    "select nickname, departure_time from registrations where email='anna@example.com'",
  );
  expect(after).toEqual({ nickname: "Anička", departure_time: "22:00" });
  // the fields keep the saved values, so a second save does not bring the old ones back
  await expect(page.locator("#nickname")).toHaveValue("Anička");
  await expect(page.locator("#departureTime")).toHaveValue("22:00");
  await page.fill("#note", "přinesu čaj");
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("Změny uloženy");
  await expect
    .poll(() => sql("select nickname, departure_time, note from registrations where email='anna@example.com'"))
    .toEqual([{ nickname: "Anička", departure_time: "22:00", note: "přinesu čaj" }]);

  // cancel frees the spot (inline confirmation panel with an optional reason)
  await page.click("button:has-text('Zrušit registraci')");
  await page.fill("#cancelReason", "nemoc");
  await page.click("button:has-text('Ano, zrušit registraci')");
  await expect(page.locator("main")).toContainText("Registrace byla zrušena");
  expect(await sql("select cancel_reason from registrations where email='anna@example.com'")).toEqual([{ cancel_reason: "nemoc" }]);
  await page.goto("/botc");
  await expect(page.locator("main")).toContainText("1 volné místo z 2");

  // re-registration reactivates the row with a fresh token
  text = await register(page, id, { first: "Anna", nick: "Anka", email: "anna@example.com" });
  expect(text).toContain("Hotovo, jsi registrovaný");
  const [re] = await sql<{ edit_token: string; status: string }>(
    "select edit_token, status from registrations where email='anna@example.com'",
  );
  expect(re.status).toBe("confirmed");
  expect(re.edit_token).not.toBe(reg.edit_token);

  // invalid token page
  await page.goto("/r/nonsense");
  await expect(page.locator("main")).toContainText("Registrace nenalezena");
});

test("e-mails are never sent twice: one confirmation per registration, re-send throttled", async ({ page }) => {
  const id = await createSession({ capacity: 5 });
  await register(page, id, { nick: "X", email: "x@example.com" });
  const [r1] = await sql<{ confirmation_sent_at: Date | null; last_email_at: Date | null }>(
    "select confirmation_sent_at, last_email_at from registrations where email='x@example.com'",
  );
  expect(r1.confirmation_sent_at).not.toBeNull();
  const firstMailAt = r1.last_email_at!.getTime();

  // duplicate submit right away → "already registered", but NO new e-mail (throttled)
  const text = await register(page, id, { nick: "X", email: "x@example.com" });
  expect(text).toContain("posílali před chvílí");
  const [r2] = await sql<{ last_email_at: Date }>("select last_email_at from registrations where email='x@example.com'");
  expect(r2.last_email_at.getTime()).toBe(firstMailAt);

  // once the cooldown has passed, exactly one re-send goes out
  await sql("update registrations set last_email_at = now() - interval '11 minutes' where email='x@example.com'");
  const text2 = await register(page, id, { nick: "X", email: "x@example.com" });
  expect(text2).toContain("Poslali jsme ti znovu odkaz");
  const [r3] = await sql<{ last_email_at: Date }>("select last_email_at from registrations where email='x@example.com'");
  expect(r3.last_email_at.getTime()).toBeGreaterThan(firstMailAt);

  // editing must not touch e-mail timestamps
  const [{ edit_token }] = await sql<{ edit_token: string }>("select edit_token from registrations where email='x@example.com'");
  await page.goto(`/r/${edit_token}`);
  await page.fill("#nickname", "Y");
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("Změny uloženy");
  const [r4] = await sql<{ last_email_at: Date }>("select last_email_at from registrations where email='x@example.com'");
  expect(r4.last_email_at.getTime()).toBe(r3.last_email_at.getTime());
});

test("language switch translates UI and is remembered", async ({ page }) => {
  const id = await createSession({ title: "Bilingual", capacity: 3 });
  await page.goto("/botc");
  await expect(page.locator("h1")).toHaveText("Nadcházející termíny");
  await page.click("button:has-text('English')");
  await expect(page.locator("h1")).toHaveText("Upcoming sessions");
  await expect(page.locator("main")).toContainText("3 spots left of 3");
  await page.goto("/botc/o-hre");
  await expect(page.locator("h1")).toHaveText("About the game");
  await expect(page.locator("main")).toContainText("What is Blood on the Clocktower");
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).toContainText("Sign up");
  const text = await register(page, id, { nick: "Eng", email: "eng@example.com" });
  expect(text).toContain("Done, you're signed up");
  const [row] = await sql<{ locale: string }>("select locale from registrations where email='eng@example.com'");
  expect(row.locale).toBe("en");
  await page.click("button:has-text('Česky')");
  await expect(page.locator("header button:has-text('English')")).toBeVisible();
  await page.goto("/botc");
  await expect(page.locator("h1")).toHaveText("Nadcházející termíny");
});

test("admin: login, create/edit session with scripts, manage registrations, delete", async ({ page }) => {
  await createAdminUser();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.fill("#email", E2E.adminEmail);
  await page.fill("#password", "wrong");
  await page.click("main button[type=submit]");
  await expect(page.locator("main")).toContainText("Nesprávný e-mail nebo heslo");
  await adminLogin(page);

  await page.goto("/admin/novy");
  await page.fill("#title", "Herní večer #2");
  await page.fill("#date", "2030-12-05");
  await page.selectOption("#startTime", "18:00");
  await page.selectOption("#endTime", "23:00");
  await page.fill("#place", "Hospoda U Zvonu");
  await page.fill("#capacity", "10");
  await page.fill("#storyteller", "Honza");
  await page.fill("input[name=scriptName] >> nth=0", "Trouble Brewing");
  await page.fill("input[name=scriptUrl] >> nth=0", "botcscripts.com/script/Trouble_Brewing/1/");
  await page.click("button:has-text('Vytvořit termín')");
  await page.waitForURL(/\/admin$/);
  const [s] = await sql<{ id: number; starts_at: Date; scripts: { name: string; url: string }[] }>(
    "select id, starts_at, scripts from sessions where title='Herní večer #2'",
  );
  expect(s.starts_at.toISOString()).toBe("2030-12-05T17:00:00.000Z"); // Prague CET → UTC
  expect(s.scripts).toEqual([{ name: "Trouble Brewing", url: "https://botcscripts.com/script/Trouble_Brewing/1/" }]);

  // pencil visible for admin on public pages, script link shown
  await page.goto("/botc");
  await expect(page.getByTestId("edit-pencil")).toHaveCount(1);
  await expect(page.locator("main")).toContainText("Trouble Brewing");
  await expect(page.locator("main")).toContainText("🎩");
  await expect(page.locator("main")).toContainText("Vypravěč: Honza");

  // register two players, admin sees them, cancels and restores one
  await register(page, s.id, { nick: "P1", email: "p1@example.com", note: "přijdu s kamarádem" });
  await register(page, s.id, { nick: "P2", email: "p2@example.com" });
  await page.goto(`/admin/termin/${s.id}`);
  await expect(page.locator("main")).toContainText("Přihlášení (2 / 10)");
  await expect(page.locator("main")).toContainText("Poznámka hráče: P1: „přijdu s kamarádem“");
  await expect(page.locator("main")).toContainText("p1@example.com");
  // the admin has to confirm removing a player; dismissing the dialog keeps them signed up
  page.once("dialog", (d) => d.dismiss());
  await page.click("tr:has-text('p2@example.com') button:has-text('Odhlásit')");
  await expect(page.locator("main")).toContainText("Přihlášení (2 / 10)");
  page.once("dialog", (d) => {
    expect(d.message()).toContain("P2");
    void d.accept();
  });
  await page.click("tr:has-text('p2@example.com') button:has-text('Odhlásit')");
  await expect(page.locator("main")).toContainText("Přihlášení (1 / 10)");
  await page.click("li:has-text('p2@example.com') button:has-text('Obnovit')");
  await expect(page.locator("main")).toContainText("Přihlášení (2 / 10)");

  // invalid script URL shows a visible error
  await page.fill("input[name=scriptUrl] >> nth=0", "tohle není adresa");
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("nemá platnou webovou adresu");

  page.on("dialog", (d) => d.accept());
  await page.click("button:has-text('Smazat termín')");
  await page.waitForURL(/\/admin$/);
  expect((await sql("select id from sessions"))).toHaveLength(0);

  await page.click("button:has-text('Odhlásit')");
  await page.waitForURL(/\/$/);
  await page.goto("/botc");
  await expect(page.getByTestId("edit-pencil")).toHaveCount(0);
});
