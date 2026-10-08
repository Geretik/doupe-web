import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { createMyGamesToken } from "../../src/modules/botc/lib/my-games-token";
import { adminLogin, createAdminUser, createSession, pragueToday, register, resetDb, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
});

test("waitlist: full session queues players, cancellation promotes the first one", async ({ page }) => {
  const id = await createSession({ capacity: 1 });
  await register(page, id, { nick: "First", email: "first@example.com" });

  // second player lands on the waitlist
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).toContainText("Zapsat se jako náhradník");
  const text = await register(page, id, { nick: "Second", email: "second@example.com" });
  expect(text).toContain("Jsi na seznamu náhradníků jako č. 1");
  const t3 = await register(page, id, { nick: "Third", email: "third@example.com" });
  expect(t3).toContain("náhradníků jako č. 2");

  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).toContainText("Náhradníci (2)");
  await page.goto("/botc");
  await expect(page.locator("main")).toContainText("Náhradníci (2)");

  // waitlisted player sees their position on the edit page
  const [w] = await sql<{ edit_token: string; status: string }>(
    "select edit_token, status from registrations where email='second@example.com'",
  );
  expect(w.status).toBe("waitlisted");
  await page.goto(`/r/${w.edit_token}`);
  await expect(page.locator("main")).toContainText("Jsi náhradník č. 1");

  // first player cancels → Second is promoted (and gets exactly one e-mail claim), Third moves up
  const [f] = await sql<{ edit_token: string }>("select edit_token from registrations where email='first@example.com'");
  await page.goto(`/r/${f.edit_token}`);
  await page.click("button:has-text('Zrušit registraci')");
  await page.click("button:has-text('Ano, zrušit registraci')");
  await expect(page.locator("main")).toContainText("Registrace byla zrušena");

  const rows = await sql<{ email: string; status: string; confirmation_sent_at: Date | null }>(
    "select email, status, confirmation_sent_at from registrations order by email",
  );
  expect(rows.map((r) => [r.email, r.status])).toEqual([
    ["first@example.com", "cancelled"],
    ["second@example.com", "confirmed"],
    ["third@example.com", "waitlisted"],
  ]);
  const [t] = await sql<{ edit_token: string }>("select edit_token from registrations where email='third@example.com'");
  await page.goto(`/r/${t.edit_token}`);
  await expect(page.locator("main")).toContainText("Jsi náhradník č. 1");

  // session is full again with a waitlist → newcomers still queue
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).toContainText("Plno");
  await expect(page.locator("main")).toContainText("Zapsat se jako náhradník");
});

test("waitlist: raising the capacity in admin promotes waitlisted players", async ({ page }) => {
  const id = await createSession({ capacity: 1 });
  await register(page, id, { nick: "A", email: "a@example.com" });
  await register(page, id, { nick: "B", email: "b@example.com" });
  await register(page, id, { nick: "C", email: "c@example.com" });
  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  await expect(page.locator("main")).toContainText("Náhradníci (2)");
  await page.fill("#capacity", "2");
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("Uloženo");
  await expect(page.locator("main")).toContainText("Přihlášení (2 / 2)");
  await expect(page.locator("main")).toContainText("Náhradníci (1)");
  const [b] = await sql<{ status: string }>("select status from registrations where email='b@example.com'");
  expect(b.status).toBe("confirmed");

  // the organiser seats a waitlisted player on a full session: one more spot, and the player is e-mailed
  await page.click("li:has-text('c@example.com') button:has-text('Přidat na termín (+1 místo)')");
  await expect(page.locator("main")).toContainText("Přihlášení (3 / 3)");
  await expect(page.locator("main")).not.toContainText("Náhradníci");
  const [c] = await sql<{ status: string; sent: boolean }>("select status, confirmation_sent_at is not null as sent from registrations where email='c@example.com'");
  expect(c).toEqual({ status: "confirmed", sent: true });
  expect(await sql("select capacity from sessions where id=$1", [id])).toEqual([{ capacity: 3 }]);
});

test("storyteller / newbie flags are stored and shown", async ({ page }) => {
  const id = await createSession({ capacity: 5 });
  await page.goto(`/botc/termin/${id}`);
  await page.fill("#firstName", "Sára");
  await page.fill("#lastName", "Vypravěčka");
  await page.fill("#nickname", "Sára");
  await page.fill("#email", "st@example.com");
  await page.fill("#phone", "777 123 456");
  await page.check("#canStorytell");
  await page.check("#isNewbie");
  await page.click("main form button[type=submit]");
  await expect(page.locator("main")).toContainText("Hotovo");
  const [r] = await sql<{ can_storytell: boolean; is_newbie: boolean }>(
    "select can_storytell, is_newbie from registrations where email='st@example.com'",
  );
  expect(r).toEqual({ can_storytell: true, is_newbie: true });
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main li:has-text('Sára')")).toContainText("🎩");

  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  await expect(page.locator("main")).toContainText("vypravěči: 1");
  await expect(page.locator("main")).toContainText("nováčci: 1");
});

test("calendar: per-session .ics, feed and Google link", async ({ page, request }) => {
  const id = await createSession({ title: "Kalendářový večer; hra, pivo", capacity: 3 });
  const res = await request.get(`/botc/termin/${id}/kalendar.ics`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = await res.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("SUMMARY:BotC: Kalendářový večer\\; hra\\, pivo");
  expect(body).toContain("LOCATION:Klubovna");
  expect(body).toContain(`UID:session-${id}@`);

  const feed = await request.get("/kalendar.ics");
  expect(feed.status()).toBe(200);
  expect(await feed.text()).toContain("Kalendářový večer");

  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).toContainText("Přidat do kalendáře");
  const google = await page.locator("main a:has-text('Google Kalendář')").getAttribute("href");
  expect(google).toContain("calendar.google.com/calendar/render");
  expect(google).toContain("Kalend");

  expect((await request.get("/botc/termin/999999/kalendar.ics")).status()).toBe(404);
});

test("reminders: cron is protected, sends once per player within the window", async ({ request, page }) => {
  // inside the 36 h window whatever the time of day the test runs
  const soon = await createSession({ title: "Zítra", capacity: 5, startsAt: new Date(Date.now() + 12 * 36e5) });
  const later = await createSession({ title: "Za týden", capacity: 5, daysAhead: 7 });
  await register(page, soon, { nick: "S", email: "soon@example.com" });
  await register(page, later, { nick: "L", email: "later@example.com" });

  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  expect((await request.get("/api/cron/reminders", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);

  const ok = await request.get("/api/cron/reminders", { headers: { authorization: "Bearer e2e-cron" } });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).reminders).toEqual({ due: 1, sent: 1, failed: 0 });

  const rows = await sql<{ email: string; reminder_sent_at: Date | null }>(
    "select email, reminder_sent_at from registrations order by email",
  );
  expect(rows.find((r) => r.email === "soon@example.com")!.reminder_sent_at).not.toBeNull();
  expect(rows.find((r) => r.email === "later@example.com")!.reminder_sent_at).toBeNull();

  // second run sends nothing
  const again = await request.get("/api/cron/reminders", { headers: { authorization: "Bearer e2e-cron" } });
  expect((await again.json()).reminders).toEqual({ due: 0, sent: 0, failed: 0 });

  // admin can trigger reminders for a session outside the window
  await adminLogin(page);
  await page.goto(`/admin/termin/${later}`);
  page.on("dialog", (d) => d.accept());
  await page.click("button:has-text('Poslat připomínku (1)')");
  await expect(page.locator("main")).toContainText("Připomínka odeslána 1×");
  const [l] = await sql<{ reminder_sent_at: Date | null }>("select reminder_sent_at from registrations where email='later@example.com'");
  expect(l.reminder_sent_at).not.toBeNull();
});

test("admin: CSV export, attendance, broadcast e-mail, duplicate, stats, Discord not configured", async ({ page, request }) => {
  const id = await createSession({ title: "Adminový večer", capacity: 4 });
  await register(page, id, { first: "Petr", last: "Novák", nick: "Péťa", email: "petr@example.com" });
  await register(page, id, { nick: "Q", email: "q@example.com" });

  // export requires admin
  expect((await request.get(`/admin/termin/${id}/export.csv`)).status()).toBe(401);
  await adminLogin(page);
  const csv = await page.request.get(`/admin/termin/${id}/export.csv`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const csvText = await csv.text();
  expect(csvText).toContain("Jméno;Příjmení;Přezdívka;E-mail;Telefon;Stav");
  expect(csvText).toContain("Petr;Novák;Péťa;petr@example.com;+420777123456;přihlášen");
  // a typed value that Excel would run as a formula is turned into text (a phone number stays as it is)
  await sql("update registrations set note = '=1+2' where email = 'q@example.com'");
  expect(await (await page.request.get(`/admin/termin/${id}/export.csv`)).text()).toContain(";'=1+2;");

  // attendance toggle
  await page.goto(`/admin/termin/${id}`);
  await page.click("tr:has-text('petr@example.com') button[title='Dorazil/a']");
  await expect(page.locator("tr:has-text('petr@example.com') button[title='Dorazil/a']")).toHaveAttribute("aria-pressed", "true");
  await page.click("tr:has-text('q@example.com') button[title='Nedorazil/a']");
  await expect(page.locator("main")).toContainText("docházka: 1 dorazilo, 1 nedorazilo");
  const att = await sql<{ email: string; attended: boolean | null }>("select email, attended from registrations order by email");
  expect(att).toEqual([
    { email: "petr@example.com", attended: true },
    { email: "q@example.com", attended: false },
  ]);

  // broadcast e-mail (logged only) bumps last_email_at
  const before = await sql<{ m: Date }>("select max(last_email_at) m from registrations");
  page.on("dialog", (d) => d.accept());
  await page.fill("#subject", "Změna místa");
  await page.fill("#message", "Hrajeme jinde.");
  await page.click("button:has-text('Odeslat přihlášeným (2)')");
  await expect(page.locator("main")).toContainText("Odeslané e-maily: 2");
  const after = await sql<{ m: Date }>("select max(last_email_at) m from registrations");
  expect(after[0].m.getTime()).toBeGreaterThan(before[0].m.getTime());

  // Discord without webhook reports it
  await page.click("button:has-text('Oznámit na Discordu')");
  await expect(page.locator("main")).toContainText("Discord není nastavený");

  // duplicate prefills form with date one week later
  await page.click("a:has-text('Duplikovat termín')");
  await expect(page).toHaveURL(new RegExp(`/admin/novy\\?from=${id}$`));
  await expect(page.locator("#title")).toHaveValue("Adminový večer");
  await expect(page.locator("#place")).toHaveValue("Klubovna");
  const [orig] = await sql<{ starts_at: Date }>("select starts_at from sessions where id=$1", [id]);
  const expectedDay = new Date(orig.starts_at.getTime() + 7 * 864e5);
  await expect(page.locator("#date")).toHaveValue(
    new Date(expectedDay.getTime() + 2 * 3600_000).toISOString().slice(0, 10), // Prague local date
  );
  await page.click("button:has-text('Vytvořit termín')");
  await page.waitForURL(/\/admin$/);
  expect(await sql("select id from sessions where title='Adminový večer'")).toHaveLength(2);

  // stats page renders
  await page.goto("/admin/statistiky");
  await expect(page.locator("h1")).toHaveText("Statistiky");
  await expect(page.locator("main")).toContainText("Nadcházejících");
});

test("archive lists past sessions with player counts", async ({ page }) => {
  const pastId = await createSession({ title: "Dávný večer", capacity: 5, daysAhead: -10 });
  await sql("insert into registrations (session_id, first_name, last_name, nickname, email, edit_token) values ($1,'A','B','Nick','old@example.com','tok1')", [pastId]);
  await createSession({ title: "Budoucí večer", capacity: 5, daysAhead: 5 });
  await page.goto("/botc/archiv");
  await expect(page.locator("h1")).toHaveText("Archiv");
  await expect(page.locator("main")).toContainText("Dávný večer");
  await expect(page.locator("main")).toContainText("1 hráč");
  await expect(page.locator("main")).not.toContainText("Budoucí večer");
  await page.goto(`/botc/termin/${pastId}`);
  await expect(page.locator("main")).toContainText("Tento termín už proběhl");
  await expect(page.locator("main")).not.toContainText("Přidat do kalendáře");
});

test("open graph metadata on session page", async ({ page }) => {
  const id = await createSession({ title: "OG večer", capacity: 5 });
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /OG večer/);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /Klubovna/);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
});

test("admin is available in English after switching the language", async ({ page }) => {
  const id = await createSession({ title: "English night", capacity: 3 });
  await register(page, id, { nick: "Anna", email: "anna@example.com" });
  await adminLogin(page);

  // the header language switch sets the cookie shared with the public site
  await page.click("header button:has-text('English')");
  await expect(page.locator("main h1")).toHaveText("Upcoming sessions");
  await expect(page.locator("main nav")).toContainText("Statistics");

  await page.goto(`/admin/termin/${id}`);
  await expect(page.locator("main")).toContainText("Signed up (1 / 3)");
  await expect(page.locator("main")).toContainText("Edit session");
  await page.click("button:has-text('Save changes')");
  await expect(page.locator("main")).toContainText("Saved.");

  // server-side validation messages come from the English dictionary too
  await page.selectOption("#registrationState", "not_open");
  await page.fill("#opensAtDate", pragueToday());
  await page.selectOption("#opensAtTime", "00:00");
  await page.click("button:has-text('Save changes')");
  await expect(page.locator("main")).toContainText("The sign-up opening time must be in the future");

  await page.goto("/admin/statistiky");
  await expect(page.locator("h1")).toHaveText("Statistics");

  // and back to Czech
  await page.click("header button:has-text('Česky')");
  await expect(page.locator("h1")).toHaveText("Statistiky");
});

test("accounts: first-run wizard, invitation link, roles", async ({ page, browser }) => {
  // no account yet → /admin/login shows the setup wizard guarded by ADMIN_PASSWORD
  await page.goto("/admin/login");
  await expect(page.locator("h1")).toHaveText("Založení prvního účtu");
  const fillSetup = async (bootstrap: string, again: string) => {
    await page.fill("#bootstrapPassword", bootstrap);
    await page.fill("#nickname", "Šéf");
    await page.fill("#email", "boss@example.com");
    await page.fill("#password", "correct-horse-battery");
    await page.fill("#passwordAgain", again);
    await page.click("main button[type=submit]");
  };
  await fillSetup("wrong", "correct-horse-battery");
  await expect(page.locator("main")).toContainText("Heslo ze serveru nesouhlasí");

  await fillSetup(E2E.adminPassword, "different-password-1");
  await expect(page.locator("main")).toContainText("Hesla se neshodují");

  await fillSetup(E2E.adminPassword, "correct-horse-battery");
  await page.waitForURL(/\/admin$/);
  await expect(page.locator("main nav")).toContainText("Šéf");
  await expect(page.locator("main nav")).toContainText("Účty");
  expect(await sql("select role, password_hash from admin_users where email='boss@example.com'")).toMatchObject([
    { role: "admin", password_hash: expect.stringMatching(/^scrypt\$/) },
  ]);

  // the wizard is gone once an account exists
  await page.click("main nav button:has-text('Odhlásit')");
  await page.goto("/admin/login");
  await expect(page.locator("h1")).toHaveText("Přihlášení do adminu");
  await adminLogin(page, { email: "boss@example.com", password: "correct-horse-battery" });

  // create an organiser invitation
  await page.goto("/admin/ucty");
  await page.selectOption("#role", "organizer");
  await page.fill("#note", "pro Pavla");
  await page.click("button:has-text('Vytvořit pozvánku')");
  const fullUrl = await page.getByTestId("invite-url").textContent();
  expect(fullUrl).toMatch(/\/admin\/pozvanka\/[A-Za-z0-9_-]+$/);
  // NEXT_PUBLIC_SITE_URL is inlined at build time, so only the path is reliable here
  const url = new URL(fullUrl!).pathname;
  await expect(page.locator("main")).toContainText("pro Pavla");

  // the invitee opens the link in a fresh browser and creates the account
  const invitee = await browser.newContext({ locale: "cs-CZ" });
  const p2 = await invitee.newPage();
  await p2.goto(url!);
  await expect(p2.locator("h1")).toHaveText("Vytvoření účtu organizátora");
  await expect(p2.locator("main")).toContainText("organizátor");
  await p2.fill("#nickname", "Pavel");
  await p2.fill("#email", "pavel@example.com");
  await p2.fill("#password", "pavlovo-tajne-heslo");
  await p2.fill("#passwordAgain", "pavlovo-tajne-heslo");
  await p2.click("main button[type=submit]");
  await p2.waitForURL(/\/admin$/);
  await expect(p2.locator("main nav")).toContainText("Pavel");
  // an organiser has no account management
  await expect(p2.locator("main nav")).not.toContainText("Účty");
  await p2.goto("/admin/ucty");
  await expect(p2).toHaveURL(/\/admin$/);
  await invitee.close();

  // the link is single-use
  await page.goto(url!);
  await expect(page).toHaveURL(/\/admin$/);
  const anon = await browser.newContext({ locale: "cs-CZ" });
  const p3 = await anon.newPage();
  await p3.goto(url!);
  await expect(p3.locator("h1")).toHaveText("Pozvánka neplatí");
  await anon.close();

  // the admin sees both accounts and can delete the organiser, but not the last admin
  await page.goto("/admin/ucty");
  await expect(page.locator("main")).toContainText("pavel@example.com");
  await expect(page.locator("main")).toContainText("Žádné otevřené pozvánky");
  page.once("dialog", (d) => d.accept());
  await page.click("tr:has-text('pavel@example.com') button:has-text('Smazat')");
  await expect(page.locator("main")).not.toContainText("pavel@example.com");
  expect(await sql("select count(*)::int as c from admin_users")).toEqual([{ c: 1 }]);
});

test("one city: no city filter or Prague on the site, a single calendar feed", async ({ page }) => {
  await createSession({ title: "Olomoucký večer" });

  await page.goto("/botc");
  await expect(page.locator("main")).toContainText("Olomoucký večer");
  await expect(page.locator("body")).not.toContainText("Praha");
  await expect(page.locator("main a[href$='/kalendar.ics']")).toBeVisible();

  const ics = await (await page.request.get("/kalendar.ics")).text();
  expect(ics).toContain("Olomoucký večer");
  expect(ics).toMatch(/X-WR-CALNAME:DoUPě Olomouc\r?\n/);

  await adminLogin(page);
  await page.goto("/admin/novy");
  await expect(page.locator("#city")).toHaveCount(0);
});

test("sign-up state: publish a session with sign-ups not open yet, open and pause them; the server enforces it", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/novy");
  await page.fill("#title", "Tajný večer");
  await page.fill("#date", "2031-02-10");
  await page.selectOption("#startTime", "18:00");
  await page.selectOption("#endTime", "22:00");
  await page.fill("#place", "Klubovna");
  await page.selectOption("#registrationState", "not_open");
  await page.click("button:has-text('Vytvořit termín')");
  await page.waitForURL(/\/admin$/);
  await expect(page.locator("main a:has-text('Tajný večer')")).toContainText("neotevřeno");
  const [{ id }] = await sql<{ id: number }>("select id from sessions where title = 'Tajný večer'");

  // public: listed, but no sign-up form
  await page.goto("/botc");
  await expect(page.locator("main")).toContainText("Registrace zatím neotevřené");
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).toContainText("Registrace na tento termín zatím nejsou otevřené.");
  await expect(page.locator("#nickname")).toHaveCount(0);

  // admin opens them with one click
  await page.goto(`/admin/termin/${id}`);
  await page.click("button:has-text('Otevřít registrace')");
  await expect(page.locator("button:has-text('Pozastavit registrace')")).toBeVisible();
  await register(page, id, { nick: "První", email: "prvni@example.com" });

  // paused while someone has the form open: the server refuses the sign-up
  await page.goto(`/botc/termin/${id}`);
  await sql("update sessions set registration_state = 'paused' where id = $1", [id]);
  await page.fill("#firstName", "Druhý");
  await page.fill("#nickname", "Druhý");
  await page.fill("#email", "druhy@example.com");
  await page.fill("#phone", "+420 777 123 456");
  await page.click("main form button[type=submit]");
  await expect(page.locator("main")).toContainText("Registrace na tento termín jsou momentálně pozastavené.");
  expect(await sql("select nickname from registrations where session_id = $1", [id])).toEqual([{ nickname: "První" }]);

  // players already signed up can still change their sign-up
  const [{ edit_token }] = await sql<{ edit_token: string }>("select edit_token from registrations where session_id = $1", [id]);
  await page.goto(`/r/${edit_token}`);
  await expect(page.locator("#nickname")).toBeVisible();
});

test("scheduled sign-up opening: closed until the time, then the open page shows the form by itself", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/novy");
  await page.fill("#title", "Časovaný večer");
  await page.fill("#date", "2031-03-10");
  await page.selectOption("#startTime", "18:00");
  await page.selectOption("#endTime", "22:00");
  await page.fill("#place", "Klubovna");
  await page.selectOption("#registrationState", "not_open");
  await page.fill("#opensAtDate", "2031-03-01");
  await page.selectOption("#opensAtTime", "18:00");
  await page.click("button:has-text('Vytvořit termín')");
  await page.waitForURL(/\/admin$/);
  await expect(page.locator("main a:has-text('Časovaný večer')")).toContainText("otevře se");
  const [{ id }] = await sql<{ id: number }>("select id from sessions where title = 'Časovaný večer'");

  // an opening time in the past is refused (the calendar starts today, so midnight today)
  await page.goto(`/admin/termin/${id}`);
  await expect(page.locator("main")).toContainText("Registrace se automaticky otevřou");
  await expect(page.locator("#opensAtDate")).toHaveValue("2031-03-01");
  await expect(page.locator("#opensAtTime")).toHaveValue("18:00");
  await page.fill("#opensAtDate", pragueToday());
  await page.selectOption("#opensAtTime", "00:00");
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("musí být v budoucnosti");

  await page.goto("/botc");
  await expect(page.locator("main")).toContainText("Registrace od");
  // the opening comes closer while a player waits on the session page
  await sql("update sessions set registration_opens_at = now() + interval '3 seconds' where id = $1", [id]);
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).toContainText("Registrace se otevřou");
  await expect(page.locator("#nickname")).toHaveCount(0);
  await expect(page.locator("#nickname")).toBeVisible({ timeout: 15000 });
  await register(page, id, { nick: "Rychlík", email: "rychlik@example.com" });

  // admin sees the sign-ups as open now
  await page.goto(`/admin/termin/${id}`);
  await expect(page.locator("button:has-text('Pozastavit registrace')")).toBeVisible();
  await expect(page.locator("#registrationState")).toHaveValue("open");
});

test("one-click open / pause: the edit form below follows, so saving it keeps the new state", async ({ page }) => {
  const id = await createSession({ title: "Přepínaný večer", capacity: 10 });
  await sql("update sessions set registration_state = 'not_open', registration_opens_at = starts_at - interval '1 day' where id = $1", [id]);
  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  await expect(page.locator("#opensAtDate")).not.toHaveValue("");
  await page.click("button:has-text('Otevřít hned')");
  await expect(page.locator("button:has-text('Pozastavit registrace')")).toBeVisible();
  await expect(page.locator("#registrationState")).toHaveValue("open");
  await expect(page.locator("#opensAtDate")).toHaveValue(""); // the manual switch replaced the scheduled opening

  await page.click("button:has-text('Pozastavit registrace')");
  await expect(page.locator("#registrationState")).toHaveValue("paused");
  await page.fill("#capacity", "12");
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("Uloženo");
  expect(await sql("select registration_state, capacity from sessions where id = $1", [id])).toEqual([
    { registration_state: "paused", capacity: 12 },
  ]);
});

test("QR code: public SVG and PNG of the sign-up link, printable poster in admin", async ({ page }) => {
  const id = await createSession({ title: "Plakátový večer" });
  const svg = await page.request.get(`/botc/termin/${id}/qr.svg`);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  expect(await svg.text()).toContain("<svg");
  const png = await page.request.get(`/botc/termin/${id}/qr.png`);
  expect(png.headers()["content-type"]).toBe("image/png");
  expect((await png.body()).subarray(1, 4).toString()).toBe("PNG");
  expect((await page.request.get("/botc/termin/99999/qr.svg")).status()).toBe(404);

  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  await page.click("a:has-text('QR kód a plakát')");
  await expect(page).toHaveURL(new RegExp(`/admin/termin/${id}/plakat$`));
  await expect(page.locator("article h1")).toHaveText("Plakátový večer");
  await expect(page.locator("article")).toContainText("Naskenuj a přihlas se");
  const img = page.locator(`article img[src="/botc/termin/${id}/qr.svg"]`);
  await expect(img).toHaveAttribute("alt", new RegExp(`/botc/termin/${id}$`));
  // the image really loads
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test("edit link: a page left open cannot change or cancel a sign-up once the session is over", async ({ page }) => {
  const id = await createSession({ title: "Končící večer", capacity: 5 });
  await register(page, id, { nick: "Pozdní", email: "pozdni@example.com" });
  const [{ edit_token }] = await sql<{ edit_token: string }>("select edit_token from registrations where email = 'pozdni@example.com'");
  await page.goto(`/r/${edit_token}`);
  // the evening ends while the page is open
  await sql("update sessions set starts_at = now() - interval '5 hours', ends_at = now() - interval '1 hour' where id = $1", [id]);

  await page.fill("#nickname", "Přejmenovaný");
  await page.click("main form button[type=submit]");
  await expect(page.locator("main")).toContainText("Tento termín už proběhl.");
  await page.click("button:has-text('Zrušit registraci')");
  await page.click("button:has-text('Ano, zrušit registraci')");
  await expect(page.locator("main")).toContainText("Tento termín už proběhl.");
  expect(await sql("select nickname, status from registrations where email = 'pozdni@example.com'")).toEqual([
    { nickname: "Pozdní", status: "confirmed" },
  ]);
});

test("privacy page: linked from the footer and the sign-up form, in both languages", async ({ page }) => {
  const id = await createSession({ title: "Soukromý večer" });
  await page.goto(`/botc/termin/${id}`);
  await page.click("main form a:has-text('Více o ochraně údajů')");
  await expect(page).toHaveURL(/\/ochrana-udaju$/);
  await expect(page.locator("h1")).toHaveText("Ochrana osobních údajů");
  const main = page.locator("main");
  await expect(main).toContainText("Klubu deskových her DoUPě Olomouc");
  await expect(main).toContainText("do uplynutí 14 dní od konání hraní");
  await expect(main).toContainText("Vercel Inc.");
  // no CONTACT_EMAIL in tests: contact falls back to Discord; no alerts webhook: Discord is not a processor
  await expect(page.getByRole("link", { name: "napiš nám na Discordu" })).toHaveAttribute("href", "https://discord.gg/vCg3WdHpZR");
  await expect(main).not.toContainText("Discord Inc.");

  await page.goto("/");
  await page.click("footer a:has-text('Ochrana údajů')");
  await expect(page).toHaveURL(/\/ochrana-udaju$/);
  await page.click("header button:has-text('English')");
  await expect(page.locator("h1")).toHaveText("Privacy");
  await expect(main).toContainText("until 14 days after the game");
});

test("admin: erasing a player on request deletes everything in all their sign-ups and frees upcoming spots", async ({ page }) => {
  const upcoming = await createSession({ title: "Nadcházející", capacity: 5 });
  const past = await createSession({ title: "Minulý", daysAhead: -3 });
  await register(page, upcoming, { nick: "Mazaný", email: "mazany@example.com", note: "přijdu s kamarádem" });
  await sql(
    "insert into registrations (session_id, nickname, email, phone, note, edit_token, attended) values ($1, 'Mazaný', 'mazany@example.com', '+420777000111', 'poznámka', 'tok-past', true)",
    [past],
  );

  await adminLogin(page);
  await page.goto(`/admin/termin/${upcoming}`);
  page.on("dialog", (d) => d.accept());
  await page.click("button[title='Smazat všechny údaje hráče (na jeho žádost)']");
  // the row moves to the cancelled list under the placeholder nickname
  await expect(page.locator("main")).toContainText("Odhlášení (1)");
  await expect(page.locator("main")).toContainText("(smazáno)");

  const rows = await sql<{ nickname: string; email: string; phone: string | null; note: string | null; status: string }>(
    "select nickname, email, phone, note, status from registrations order by session_id",
  );
  expect(rows.map((r) => [r.nickname, r.phone, r.note, r.status])).toEqual([
    ["(smazáno)", null, null, "cancelled"],
    ["(smazáno)", null, null, "confirmed"],
  ]);
  for (const r of rows) expect(r.email).toMatch(/^erased-[0-9a-f]{24}@anonym\.invalid$/);
  // the two sign-ups are no longer tied together
  expect(rows[0].email).not.toBe(rows[1].email);
  await page.goto("/admin/statistiky");
  await expect(page.locator("main")).not.toContainText("(smazáno)");
});

test("personal data is deleted 14 days after the session; nickname, attendance and stats stay", async ({ page, request }) => {
  const old = await createSession({ title: "Starý večer", daysAhead: -20 });
  const recent = await createSession({ title: "Nedávný večer", daysAhead: -3 });
  // the same player at both; sign-ups for past sessions go straight into the database
  for (const [sessionId, token] of [[old, "tok-old"], [recent, "tok-recent"]] as const) {
    await sql(
      "insert into registrations (session_id, first_name, last_name, nickname, email, phone, note, cancel_reason, edit_token, attended) values ($1, 'Jan', 'Novák', 'Honza', 'honza@example.com', '+420777123456', 'poznámka', 'důvod', $2, true)",
      [sessionId, token],
    );
  }
  const cron = () => request.get("/api/cron/reminders", { headers: { authorization: "Bearer e2e-cron" } });

  expect((await (await cron()).json()).retention).toEqual({ anonymized: 1 });
  const [o] = await sql<Record<string, unknown>>(
    "select first_name, last_name, email, phone, note, cancel_reason, nickname, attended from registrations where edit_token = 'tok-old'",
  );
  // the note and cancel reason are kept on purpose
  expect(o).toMatchObject({ first_name: null, last_name: null, phone: null, note: "poznámka", cancel_reason: "důvod", nickname: "Honza", attended: true });
  expect(o.email).toMatch(/^[0-9a-f]{24}@anonym\.invalid$/);
  expect(await sql("select email, phone from registrations where edit_token = 'tok-recent'")).toEqual([
    { email: "honza@example.com", phone: "+420777123456" },
  ]);
  // the next run has nothing left to do
  expect((await (await cron()).json()).retention).toEqual({ anonymized: 0 });

  // one game played at the anonymised night, one sat out at the recent one
  for (const [sessionId, token, role] of [[old, "tok-old", "washerwoman"], [recent, "tok-recent", null]] as const) {
    const [{ id }] = await sql<{ id: number }>("insert into games (session_id, script_name) values ($1, 'Trouble Brewing') returning id", [sessionId]);
    await sql("insert into game_players (game_id, registration_id, role) select $1, id, $2 from registrations where edit_token = $3", [id, role, token]);
  }

  // admin: deleted data is not shown; stats still see one player with two sessions and one game
  await adminLogin(page);
  await page.goto(`/admin/termin/${old}`);
  await expect(page.locator("main")).toContainText("byly 14 dní po termínu smazány");
  await expect(page.locator("main")).toContainText("Honza");
  await expect(page.locator("main")).not.toContainText("anonym.invalid");
  await page.goto("/admin/statistiky");
  const row = page.locator("main tr:has-text('Honza')");
  await expect(row).toHaveCount(1);
  await expect(row.locator("td").nth(1)).toHaveText("honza@example.com");
  await expect(row.locator("td").nth(2)).toHaveText("2");
  await expect(row.locator("td").nth(3)).toHaveText("1");

  // "my games" still finds the older, anonymised game through the e-mail's pseudonym
  process.env.ADMIN_SECRET = "e2e-secret"; // same as the e2e server, so the token verifies
  await page.goto(`/botc/moje-hry/${createMyGamesToken("honza@example.com")}`);
  await expect(page.locator("main")).toContainText("Starý večer");
  await expect(page.locator("main")).toContainText("Nedávný večer");
});

test("sitemap lists public pages and upcoming sessions; robots.txt keeps admin and personal links out", async ({ page }) => {
  const upcoming = await createSession({ title: "Budoucí", daysAhead: 5 });
  const past = await createSession({ title: "Minulý", daysAhead: -5 });
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/botc</loc>");
  expect(sitemap).toContain("/hry</loc>");
  expect(sitemap).not.toContain("/klub</loc>");
  expect(sitemap).toContain(`/botc/termin/${upcoming}</loc>`);
  expect(sitemap).not.toContain(`/botc/termin/${past}</loc>`);
  expect(sitemap).not.toContain("/admin");

  const robots = await (await page.request.get("/robots.txt")).text();
  for (const path of ["/admin", "/api/", "/botc/r/", "/botc/moje-hry/", "/r/", "/moje-hry/"]) {
    expect(robots).toContain(`Disallow: ${path}\n`);
  }
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
});

test("old vercel.app addresses redirect to www.doupeol.cz, except /api (cron)", async ({ page }) => {
  for (const host of ["playbotc.vercel.app", "botc-olomoc.vercel.app"]) {
    const res = await page.request.get("/termin/5?x=1", { headers: { host }, maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe("https://www.doupeol.cz/termin/5?x=1");
  }
  const home = await page.request.get("/", { headers: { host: "playbotc.vercel.app" }, maxRedirects: 0 });
  expect(home.headers()["location"]).toBe("https://www.doupeol.cz/");
  const cron = await page.request.get("/api/cron/reminders", { headers: { host: "playbotc.vercel.app" }, maxRedirects: 0 });
  expect(cron.status()).toBe(401);
  // the site's own address is not redirected
  expect((await page.request.get("/", { maxRedirects: 0 })).status()).toBe(200);
});

test("pwa manifest and icons are served, share button on session page", async ({ page }) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const json = await manifest.json();
  expect(json.display).toBe("standalone");
  expect((await page.request.get("/icon")).headers()["content-type"]).toContain("image/png");

  const id = await createSession({ title: "Sdílený večer", capacity: 5 });
  await page.goto(`/botc/termin/${id}`);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.click("main button:has-text('Sdílet termín')");
  await expect(page.locator("main button:has-text('Odkaz zkopírován')")).toBeVisible();
  // only the path: NEXT_PUBLIC_SITE_URL is inlined at build time
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/botc/termin/${id}$`));
});

test("organisers' calendar feed is private and lists players; cron endpoint runs daily jobs", async ({ page }) => {
  const id = await createSession({ title: "Org feed večer", capacity: 5 });
  await register(page, id, { nick: "Feeder", email: "feeder@example.com" });

  expect((await page.request.get("/admin/kalendar.ics")).status()).toBe(401);
  expect((await page.request.get("/admin/kalendar.ics?key=wrong")).status()).toBe(401);

  await adminLogin(page);
  await page.goto("/admin");
  const feedUrl = await page.locator("main code").last().textContent();
  expect(feedUrl).toMatch(/\/admin\/kalendar\.ics\?key=[0-9a-f]{32}$/);
  const anon = await page.context().browser()!.newContext();
  const res = await anon.request.get(new URL(feedUrl!).pathname + new URL(feedUrl!).search);
  expect(res.ok()).toBeTruthy();
  // unfold RFC 5545 line continuations before searching
  const ics = (await res.text()).replace(/\r\n[ \t]/g, "");
  expect(ics).toContain("Org feed večer");
  expect(ics).toContain("feeder@example.com");

  // a leaked link can be replaced: the old one stops working
  const pathOf = (u: string) => new URL(u).pathname + new URL(u).search;
  page.once("dialog", (d) => d.accept());
  await page.click("main button:has-text('Nový odkaz')");
  await expect(page.locator("main")).toContainText("starý odkaz už nefunguje");
  const newUrl = await page.locator("main code").last().textContent();
  expect(newUrl).not.toBe(feedUrl);
  expect((await anon.request.get(pathOf(feedUrl!))).status()).toBe(401);
  expect((await anon.request.get(pathOf(newUrl!))).ok()).toBeTruthy();
  // every organiser has their own link, and it goes with the account
  const otherId = await createAdminUser({ email: "other@example.com", role: "organizer", nickname: "Jiný" });
  await sql("update admin_users set feed_key = $1 where id = $2", ["0123456789abcdef0123456789abcdef", otherId]);
  expect((await anon.request.get("/admin/kalendar.ics?key=0123456789abcdef0123456789abcdef")).ok()).toBeTruthy();
  await sql("delete from admin_users where id = $1", [otherId]);
  expect((await anon.request.get("/admin/kalendar.ics?key=0123456789abcdef0123456789abcdef")).status()).toBe(401);
  await anon.close();

  const cron = await page.request.get("/api/cron/reminders");
  expect(cron.ok()).toBeTruthy();
  expect(await cron.json()).toMatchObject({ reminders: expect.any(Object), spots: { posted: 0 } });
});

test("new session form: calendars from today, times kept and reused, an end after midnight is the next day", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/novy");
  await expect(page.locator("#date")).toHaveAttribute("min", pragueToday());
  await expect(page.locator("#opensAtDate")).toHaveAttribute("min", pragueToday());
  // an opening picked by mistake can be cleared again
  await page.selectOption("#registrationState", "not_open");
  await page.fill("#opensAtDate", "2031-05-01");
  await page.click("button:has-text('Vymazat')");
  await expect(page.locator("#opensAtDate")).toHaveValue("");
  await page.fill("#title", "Dlouhá noc");
  await page.fill("#date", "2031-05-15");
  await page.selectOption("#startTime", "20:00");
  await page.selectOption("#endTime", "01:30");
  await expect(page.locator("#endTime option:checked")).toHaveText("01:30 (další den)");
  // moving the start keeps the length of the evening
  await page.selectOption("#startTime", "19:00");
  await expect(page.locator("#endTime")).toHaveValue("00:30");
  await page.selectOption("#startTime", "20:00");
  await expect(page.locator("#endTime")).toHaveValue("01:30");
  await page.fill("#place", "Klubovna");
  await page.click("button:has-text('Vytvořit termín')");
  await page.waitForURL(/\/admin$/);
  const [s] = await sql<{ starts_at: Date; ends_at: Date; registration_opens_at: Date | null }>(
    "select starts_at, ends_at, registration_opens_at from sessions where title = 'Dlouhá noc'",
  );
  expect(s.starts_at.toISOString()).toBe("2031-05-15T18:00:00.000Z"); // 20:00 CEST
  expect(s.ends_at.toISOString()).toBe("2031-05-15T23:30:00.000Z"); // 01:30 CEST on the 16th
  expect(s.registration_opens_at).toBeNull();

  // the next new session starts with the same times and no date
  await page.goto("/admin/novy");
  await expect(page.locator("#date")).toHaveValue("");
  await expect(page.locator("#startTime")).toHaveValue("20:00");
  await expect(page.locator("#endTime")).toHaveValue("01:30");
});

test("session form offers earlier places, storytellers and scripts; a known script fills in its link", async ({ page }) => {
  const id = await createSession({ title: "Minulý večer", daysAhead: -10 });
  await sql("update sessions set place = 'Čajovna Ponorka', storyteller = 'Honza', scripts = $2 where id = $1", [
    id,
    JSON.stringify([{ name: "Trouble Brewing", url: "https://botcscripts.com/script/Trouble_Brewing/1/" }]),
  ]);
  await sql("insert into games (session_id, script_name, script_url) values ($1, 'Bad Moon Rising', 'https://botcscripts.com/script/Bad_Moon_Rising/1/')", [id]);
  await adminLogin(page);
  await page.goto("/admin/novy");
  await expect(page.locator("#place-suggestions option[value='Čajovna Ponorka']")).toHaveCount(1);
  await expect(page.locator("#storyteller-suggestions option[value='Honza']")).toHaveCount(1);
  await expect(page.locator("#storyteller-suggestions option[value='Správce']")).toHaveCount(1); // organiser account
  await expect(page.locator("#script-suggestions option")).toHaveCount(2);

  const name = page.locator("input[name=scriptName] >> nth=0");
  const url = page.locator("input[name=scriptUrl] >> nth=0");
  await name.fill("trouble brewing");
  await expect(url).toHaveValue("https://botcscripts.com/script/Trouble_Brewing/1/");
  await name.fill("Bad Moon Rising");
  await expect(url).toHaveValue("https://botcscripts.com/script/Bad_Moon_Rising/1/");
  await name.fill("Vlastní script");
  await expect(url).toHaveValue("");
  // a link typed by hand is never replaced
  await url.fill("https://example.com/vlastni.pdf");
  await name.fill("Trouble Brewing");
  await expect(url).toHaveValue("https://example.com/vlastni.pdf");
});

test("recurring sessions, games record (editable after saving) shown in archive and stats", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/novy");
  await page.fill("#title", "Úterky");
  await page.fill("#date", "2031-03-04");
  await page.selectOption("#startTime", "18:00");
  await page.selectOption("#endTime", "22:00");
  await page.fill("#place", "Klub");
  await page.selectOption("#repeatWeeks", "2");
  await page.fill("#repeatCount", "3");
  await page.click("button:has-text('Vytvořit termín')");
  await page.waitForURL(/\/admin$/);
  const rows = await sql<{ starts_at: Date }>("select starts_at from sessions where title='Úterky' order by starts_at");
  expect(rows.map((r) => r.starts_at.toISOString().slice(0, 10))).toEqual(["2031-03-04", "2031-03-18", "2031-04-01"]);

  // a past session gets two games recorded
  const pastId = await createSession({ title: "Hraný večer", capacity: 8, daysAhead: -3 });
  await sql("update sessions set scripts=$1 where id=$2", [JSON.stringify([{ name: "Trouble Brewing", url: "https://botcscripts.com/tb" }]), pastId]);
  await page.goto(`/admin/termin/${pastId}`);
  await page.selectOption("#winner", "good");
  await page.fill("#players", "9");
  await page.click("button:has-text('Přidat hru')");
  await expect(page.locator("main")).toContainText("1.Trouble Brewing");
  await page.selectOption("#scriptPick", "__custom");
  await page.fill("form:has(#scriptPick) input[name=scriptName]", "Bad Moon Rising");
  await page.selectOption("#winner", "evil");
  await page.click("button:has-text('Přidat hru')");
  await expect(page.locator("main")).toContainText("2.Bad Moon Rising");

  // saved games can be edited; the script (picked with its link, or typed) stays as it was
  const [tb, bmr] = await sql<{ id: number }>("select id from games where session_id=$1 order by id", [pastId]);
  await page.locator("li", { hasText: "1.Trouble Brewing" }).getByRole("button", { name: "Upravit" }).click();
  await expect(page.locator(`#game${tb.id}-players`)).toHaveValue("9");
  await page.fill(`#game${tb.id}-players`, "10");
  await page.fill(`#game${tb.id}-notes`, "Těsný konec");
  await page.locator(`form:has(#game${tb.id}-players)`).getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.locator("main")).toContainText("1.Trouble Brewing · 😇 vyhrálo dobro · 10 hráčů · Těsný konec");
  await expect(page.locator(`#game${tb.id}-players`)).toHaveCount(0);

  await page.locator("li", { hasText: "2.Bad Moon Rising" }).getByRole("button", { name: "Upravit" }).click();
  await expect(page.locator(`#game${bmr.id}-scriptPick`)).toHaveValue("Bad Moon Rising");
  await expect(page.locator(`#game${bmr.id}-winner`)).toHaveValue("evil");
  await page.fill(`#game${bmr.id}-notes`, "neuloží se");
  await page.locator(`form:has(#game${bmr.id}-notes)`).getByRole("button", { name: "Zrušit", exact: true }).click();
  await page.locator("li", { hasText: "2.Bad Moon Rising" }).getByRole("button", { name: "Upravit" }).click();
  await expect(page.locator(`#game${bmr.id}-notes`)).toHaveValue("");
  await page.fill(`#game${bmr.id}-players`, "7");
  await page.selectOption(`#game${bmr.id}-winner`, "good");
  await page.locator(`form:has(#game${bmr.id}-notes)`).getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.locator("main")).toContainText("2.Bad Moon Rising · 😇 vyhrálo dobro · 7 hráčů");
  expect(await sql("select script_name, script_url, winner, players, notes from games where session_id=$1 order by id", [pastId])).toEqual([
    { script_name: "Trouble Brewing", script_url: "https://botcscripts.com/tb", winner: "good", players: 10, notes: "Těsný konec" },
    { script_name: "Bad Moon Rising", script_url: null, winner: "good", players: 7, notes: null },
  ]);

  await page.goto("/botc/archiv");
  await expect(page.locator("main")).toContainText("Hra 1 · Trouble Brewing · 10 hráčů😇 vyhrálo dobro");
  await expect(page.locator("main")).toContainText("Hra 2 · Bad Moon Rising · 7 hráčů😇 vyhrálo dobro");

  await page.goto("/admin/statistiky");
  await expect(page.locator("main")).toContainText("Her celkem2");
  await expect(page.locator("main")).toContainText("Trouble Brewing11 / 0");
});

test("my games: magic link lists the player's sign-ups", async ({ page }) => {
  const id = await createSession({ title: "Můj večer", capacity: 4 });
  await register(page, id, { nick: "Já", email: "me@example.com" });

  // requesting a link always answers the same way
  await page.goto("/botc/moje-hry");
  await page.fill("#email", "me@example.com");
  await page.click("main button[type=submit]");
  await expect(page.locator("main")).toContainText("odkaz ti přišel");

  process.env.ADMIN_SECRET = "e2e-secret"; // same as the e2e server, so the token verifies
  await page.goto(`/botc/moje-hry/${createMyGamesToken("me@example.com")}`);
  await expect(page.locator("h1")).toHaveText("Moje hry");
  await expect(page.locator("main")).toContainText("Můj večer");
  await expect(page.locator("main")).toContainText("přihlášen/a");
  await expect(page.locator("main a:has-text('Upravit / zrušit')")).toBeVisible();

  await page.goto("/botc/moje-hry/neplatny.token.xyz");
  await expect(page.locator("main")).toContainText("Odkaz je neplatný");
});

test("my games: the player's stats, and the nights they came to with who played what", async ({ page }) => {
  const first = await createSession({ title: "První večer", daysAhead: -10 });
  const second = await createSession({ title: "Druhý večer", daysAhead: -3 });
  const missed = await createSession({ title: "Zmeškaný večer", daysAhead: -6 });
  const signUp = async (session: number, nickname: string, email: string, attended: boolean | null = null) =>
    (await sql<{ id: number }>(
      "insert into registrations (session_id, nickname, email, edit_token, attended) values ($1, $2, $3, $4, $5) returning id",
      [session, nickname, email, `tok-${session}-${nickname}`, attended],
    ))[0].id;
  const me1 = await signUp(first, "Já", "hrac@example.com");
  const neighbour = await signUp(first, "Soused", "soused@example.com");
  const me2 = await signUp(second, "Já", "hrac@example.com");
  await signUp(missed, "Já", "hrac@example.com", false);
  const game = async (session: number, script: string, winner: "good" | "evil", roster: [number, string][]) => {
    const [{ id }] = await sql<{ id: number }>("insert into games (session_id, script_name, winner) values ($1, $2, $3) returning id", [session, script, winner]);
    for (const [registrationId, role] of roster) {
      await sql("insert into game_players (game_id, registration_id, role) values ($1, $2, $3)", [id, registrationId, role]);
    }
  };
  // a win as the Chef, a loss as the Imp, then a night as the storyteller
  await game(first, "Trouble Brewing", "good", [[me1, "chef"], [neighbour, "imp"]]);
  await game(first, "Trouble Brewing", "good", [[me1, "imp"], [neighbour, "chef"]]);
  await game(second, "Bad Moon Rising", "evil", [[me2, "storyteller"]]);

  process.env.ADMIN_SECRET = "e2e-secret"; // same as the e2e server, so the token verifies
  await page.goto(`/botc/moje-hry/${createMyGamesToken("hrac@example.com")}`);
  const stats = page.getByTestId("my-stats");
  // the no-show night does not count
  await expect(stats).toContainText(/Hraješ s námi od \d+\. \p{L}+ \d{4}\./u);
  await expect(stats).toContainText("Herní večery2");
  await expect(stats).toContainText("Odehrané hry2");
  await expect(stats).toContainText("Výhry1 / 250 %");
  await expect(stats).toContainText("Jako vypravěč1");
  await expect(stats).toContainText("😇 Za dobro: 1 hra · 1 výhra");
  await expect(stats).toContainText("😈 Za zlo: 1 hra · 0 výher");
  await expect(stats).toContainText("Kuchař1×");
  await expect(stats).toContainText("Čert1×");
  await expect(stats).toContainText("Scripty: Trouble Brewing 2×");

  // newest night first and unfolded; the older one unfolds to the games as in the archive
  const nights = page.locator("main details");
  await expect(nights).toHaveCount(2);
  await expect(nights.nth(0)).toHaveAttribute("open", "");
  await expect(nights.nth(0)).toContainText("Druhý večer");
  await expect(nights.nth(0)).toContainText("Hrál/a jsi: Vypravěč");
  await expect(nights.nth(1)).toContainText("Hrál/a jsi: Kuchař, Čert");
  await nights.nth(1).locator("summary").click();
  await expect(nights.nth(1)).toContainText("Hra 2 · Trouble Brewing😇 vyhrálo dobro");
  await expect(nights.nth(1).getByText("Soused")).toHaveCount(2);
  // the player's own chips stand out
  await expect(nights.nth(1).locator("span.font-bold", { hasText: "Já" })).toHaveCount(2);
  await expect(page.locator("main")).not.toContainText("Zmeškaný večer");
});

test("phone is optional but validated, normalised and shown only to organisers; hourly presence overview", async ({ page }) => {
  const id = await createSession({ capacity: 5 });
  // invalid phone → validation error, nothing saved
  await page.goto(`/botc/termin/${id}`);
  await page.fill("#nickname", "Bez");
  await page.fill("#email", "bez@example.com");
  await page.fill("#phone", "abc");
  await page.click("main form button[type=submit]");
  await expect(page.locator("main")).toContainText("Zadej platné telefonní číslo");
  expect(await sql("select id from registrations where email='bez@example.com'")).toHaveLength(0);

  // only nickname and e-mail are required: name and phone may stay empty
  const other = await createSession({ capacity: 5 });
  await page.goto(`/botc/termin/${other}`);
  await page.fill("#nickname", "Bez");
  await page.fill("#email", "bez@example.com");
  await page.click("main form button[type=submit]");
  await expect(page.getByTestId("register-result")).toBeVisible({ timeout: 15000 });
  const [bez] = await sql<{ first_name: string | null; last_name: string | null; phone: string | null }>(
    "select first_name, last_name, phone from registrations where email='bez@example.com'",
  );
  expect(bez).toEqual({ first_name: null, last_name: null, phone: null });

  // session is 19:00–23:00 Prague (17:00 UTC + 4 h)
  await register(page, id, { nick: "Celý", email: "cely@example.com", phone: "+420 777 123 456" });
  await register(page, id, { nick: "Pozdní", email: "pozdni@example.com", phone: "777-000-111", arrival: "20:30" });
  const [r] = await sql<{ phone: string }>("select phone from registrations where email='pozdni@example.com'");
  expect(r.phone).toBe("777000111");

  // never on the public page
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).not.toContainText("777123456");

  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  await expect(page.locator("main table")).toContainText("+420777123456");
  const rows = page.getByTestId("presence").locator("li");
  await expect(rows).toHaveCount(4);
  expect(await rows.locator("> span:first-child").allTextContents()).toEqual(["19:00–20:00", "20:00–21:00", "21:00–22:00", "22:00–23:00"]);
  expect(await rows.locator("strong").allTextContents()).toEqual(["1", "2", "2", "2"]);
  await expect(rows.nth(0)).not.toContainText("všichni");
  await expect(rows.nth(1)).toContainText("všichni");

  // a player without name or phone still shows up in the admin table
  await page.goto(`/admin/termin/${other}`);
  await expect(page.locator("main table")).toContainText("Bez");
});

test("session settings: 'arrive later' checkbox instead of times, required phone, privacy note", async ({ page }) => {
  const id = await createSession({ capacity: 5, arrivalMode: "late", phoneRequired: true });
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("#arrivalTime")).toHaveCount(0);
  await expect(page.locator("#arrivesLate")).toBeVisible();
  await expect(page.locator("main")).toContainText("k pořádání tohoto hraní a pro statistiky docházky v klubu");
  await expect(page.locator("main")).toContainText("se 14 dní po konání hraní automaticky smažou");

  // phone is required for this session: the browser insists, and so does the server
  await expect(page.locator("#phone")).toHaveAttribute("required", "");
  await page.fill("#nickname", "Pozdní");
  await page.fill("#email", "pozdni@example.com");
  await page.locator("#phone").evaluate((el) => el.removeAttribute("required"));
  await page.click("main form button[type=submit]");
  await expect(page.locator("main")).toContainText("Vyplň telefon");
  expect(await sql("select id from registrations where email='pozdni@example.com'")).toHaveLength(0);

  // the form is reset after a failed submit, so fill everything again
  await page.fill("#nickname", "Pozdní");
  await page.fill("#email", "pozdni@example.com");
  await page.fill("#phone", "777 000 111");
  await page.check("#arrivesLate");
  await page.click("main form button[type=submit]");
  await expect(page.getByTestId("register-result")).toBeVisible({ timeout: 15000 });
  const [r] = await sql<{ arrives_late: boolean; arrival_time: string | null; phone: string }>(
    "select arrives_late, arrival_time, phone from registrations where email='pozdni@example.com'",
  );
  expect(r).toEqual({ arrives_late: true, arrival_time: null, phone: "777000111" });

  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  await expect(page.locator("#arrivalMode")).toHaveValue("late");
  await expect(page.locator("#phoneRequired")).toBeChecked();
  await expect(page.locator("main table")).toContainText("později");
  await expect(page.getByTestId("presence")).toHaveCount(0);
});

test("game language: picked per session in admin, shown to players in both UI languages, kept when duplicating", async ({ page }) => {
  const id = await createSession({ title: "Anglický večer" });
  await createSession({ title: "Dvojjazyčný večer", gameLanguage: "both" });
  await adminLogin(page);
  await page.goto("/admin/novy");
  await expect(page.locator("#gameLanguage")).toHaveValue("cs");
  await page.goto(`/admin/termin/${id}`);
  await expect(page.locator("#gameLanguage")).toHaveValue("cs");
  await page.selectOption("#gameLanguage", "en");
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("Uloženo");
  expect(await sql("select game_language from sessions where id = $1", [id])).toEqual([{ game_language: "en" }]);

  await page.goto("/botc");
  await expect(page.locator("main")).toContainText("Jazyk: angličtina");
  await expect(page.locator("main")).toContainText("Jazyk: čeština i angličtina");
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main")).toContainText("Jazyk: angličtina");
  await page.click("header button:has-text('English')");
  await expect(page.locator("main")).toContainText("Language: English");

  await page.goto(`/admin/termin/${id}/plakat`);
  await expect(page.locator("article")).toContainText("Language: English");
  await page.goto(`/admin/novy?from=${id}`);
  await expect(page.locator("#gameLanguage")).toHaveValue("en");
});

test("club page is the home page: schedule, place and Discord sign-up, in both languages", async ({ page }) => {
  await page.goto("/botc");
  await page.click("header nav a:has-text('Klub')");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("header nav a[aria-current=page]")).toHaveText("Klub");
  await expect(page.locator("h1")).toHaveText("Klub deskových her DoUPě Olomouc");
  await expect(page.locator("main")).toContainText("Každé úterý a čtvrtek v 16:30");
  await expect(page.locator("main")).toContainText("učebna 1.037");
  await expect(page.locator("main")).toContainText("Discord je náš hlavní komunikátor.");
  await expect(page.getByRole("link", { name: "Přidat se na Discord" })).toHaveAttribute(
    "href",
    "https://discord.gg/vCg3WdHpZR",
  );

  await page.click("header button:has-text('English')");
  await expect(page.locator("main")).toContainText("A board game club in Olomouc");
  await expect(page.locator("main")).toContainText("Discord is our main communication channel.");
  await expect(page.getByRole("link", { name: "Join our Discord" })).toHaveAttribute(
    "href",
    "https://discord.gg/vCg3WdHpZR",
  );
});

test("club page: a message to the organisers, with a honeypot and a limit per network", async ({ page }) => {
  // no CONTACT_EMAIL in tests: the message goes to the accounts' e-mails
  await createAdminUser({ email: "org@example.com", password: "org-password-123", nickname: "Organizátorka", role: "organizer" });
  const section = page.locator("#vzkaz");
  const form = section.locator("form");
  async function write(text: string) {
    await page.goto("/");
    await form.locator("#email").fill("host@example.com");
    await form.locator("#text").fill(text);
  }

  await write("   ");
  await expect(section.locator("h2")).toHaveText("Nech nám vzkaz");
  await form.locator("button[type=submit]").click();
  await expect(form).toContainText("Napiš vzkaz");
  // what was typed stays
  await expect(form.locator("#email")).toHaveValue("host@example.com");
  await form.locator("#name").fill("Host");
  await form.locator("#text").fill("Ahoj, můžu ve čtvrtek přijít poprvé?");
  await form.locator("button[type=submit]").click();
  await expect(section).toContainText("Díky, vzkaz dorazil organizátorům.");
  expect((await sql<{ kind: string }>("select kind from link_requests")).map((r) => r.kind)).toEqual(["message"]);

  // a bot filling the hidden field is told it worked, nothing is sent or counted
  await write("Cheap pills");
  await form.locator("#website").evaluate((el: HTMLInputElement) => (el.value = "https://spam.example"));
  await form.locator("button[type=submit]").click();
  await expect(section).toContainText("Díky, vzkaz dorazil organizátorům.");
  expect(await sql("select id from link_requests")).toHaveLength(1);

  // five messages an hour from one network
  for (let i = 2; i <= 6; i++) {
    await write(`Vzkaz číslo ${i}`);
    await form.locator("button[type=submit]").click();
    await expect(section).toContainText(i <= 5 ? "Díky, vzkaz dorazil organizátorům." : "Z této sítě přišlo příliš mnoho vzkazů.");
  }
  expect(await sql("select id from link_requests")).toHaveLength(5);

  await page.click("header button:has-text('English')");
  await expect(section.locator("h2")).toHaveText("Leave us a message");
  await expect(form.locator("button[type=submit]")).toHaveText("Send message");
});

test("Blood on the Clocktower lives under /botc with its own menu; old addresses redirect there", async ({ page }) => {
  const id = await createSession({ title: "Modulový večer" });
  await page.goto("/");
  await page.click("main a:has-text('Krvavka')");
  await expect(page).toHaveURL(/\/botc$/);
  await expect(page.locator("header nav a[aria-current=page]")).toHaveText("Krvavka");
  await expect(page.locator("main nav a[aria-current=page]")).toHaveText("Termíny");
  await page.click("main nav a:has-text('Archiv')");
  await expect(page).toHaveURL(/\/botc\/archiv$/);
  await expect(page.locator("main nav a[aria-current=page]")).toHaveText("Archiv");
  // a session's page belongs to the session list in the menu
  await page.goto(`/botc/termin/${id}`);
  await expect(page.locator("main nav a[aria-current=page]")).toHaveText("Termíny");

  // links in sent e-mails, Discord posts and QR codes on printed posters
  const moved: [string, string][] = [
    [`/termin/${id}?utm=qr`, `/botc/termin/${id}?utm=qr`],
    [`/termin/${id}/kalendar.ics`, `/botc/termin/${id}/kalendar.ics`],
    ["/r/abc123", "/botc/r/abc123"],
    ["/termin", "/botc"],
    ["/moje-hry", "/botc/moje-hry"],
    ["/moje-hry/abc.def", "/botc/moje-hry/abc.def"],
    ["/archiv", "/botc/archiv"],
    ["/o-hre", "/botc/o-hre"],
    ["/klub", "/"],
  ];
  for (const [from, to] of moved) {
    const res = await page.request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(308);
    expect(res.headers()["location"], from).toBe(to);
  }
  await page.goto(`/termin/${id}`);
  await expect(page).toHaveURL(new RegExp(`/botc/termin/${id}$`));
  await expect(page.locator("h1")).toContainText("Modulový večer");
  // /r alone was never a page: no redirect to a missing one
  expect((await page.request.get("/r", { maxRedirects: 0 })).status()).toBe(404);
  // subscribed calendars keep polling the feed at its old address
  expect((await page.request.get("/kalendar.ics", { maxRedirects: 0 })).status()).toBe(200);
});

test("admin home warns when the daily jobs did not run and CONTACT_EMAIL is missing", async ({ page }) => {
  await adminLogin(page);
  const main = page.locator("main");
  await expect(main).toContainText("Nastavení webu potřebuje pozornost");
  await expect(main).toContainText("mazání osobních údajů po 14 dnech) zatím neproběhly");
  await expect(main.getByRole("link", { name: "Spustit teď" })).toHaveAttribute("href", "/api/cron/reminders");
  // no CONTACT_EMAIL in tests
  await expect(main).toContainText("chybí CONTACT_EMAIL");

  // a run (here as the signed-in organiser, like "Run now") is recorded
  expect((await page.request.get("/api/cron/reminders")).ok()).toBeTruthy();
  await page.reload();
  await expect(main).not.toContainText("Denní úlohy");
  await expect(main).toContainText("chybí CONTACT_EMAIL");

  // more than a day and a bit without a run counts as stopped
  await sql("update job_runs set finished_at = now() - interval '30 hours'");
  await page.reload();
  await expect(main).toContainText("naposledy proběhly");
});

test("admin login: too many wrong passwords from one network are refused for a while", async ({ browser, page }) => {
  await createAdminUser();
  // next start keeps the client's x-forwarded-for (on Vercel the proxy sets it)
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.7" } });
  const attacker = await ctx.newPage();
  const attempt = async (password: string) => {
    await attacker.goto("/admin/login");
    await attacker.fill("#email", E2E.adminEmail);
    await attacker.fill("#password", password);
    await attacker.click("main button[type=submit]");
  };
  for (let i = 0; i < 9; i++) {
    await attempt("wrong");
    await expect(attacker.locator("main")).toContainText("Nesprávný e-mail nebo heslo");
  }
  // a right password in between does not wipe the earlier failures (an organiser cannot reset the count with their own login)
  await attempt(E2E.adminUserPassword);
  await attacker.waitForURL(/\/admin$/);
  await ctx.clearCookies();
  await attempt("wrong");
  await expect(attacker.locator("main")).toContainText("Nesprávný e-mail nebo heslo");
  // blocked now, even with the right password
  await attempt(E2E.adminUserPassword);
  await expect(attacker.locator("main")).toContainText("Příliš mnoho špatných pokusů");
  await expect(attacker).toHaveURL(/\/admin\/login$/);

  // other networks are not affected
  await adminLogin(page);

  // once the failures are older than the window, the network can log in again; a right password is not counted
  await sql("update login_failures set created_at = now() - interval '16 minutes'");
  await attempt(E2E.adminUserPassword);
  await attacker.waitForURL(/\/admin$/);
  expect(await sql("select id from login_failures where created_at > now() - interval '15 minutes'")).toHaveLength(0);
  await ctx.close();
});

test("admin: change own password, other devices are logged out", async ({ browser, page }) => {
  await adminLogin(page);
  // a second device signed in before the change
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await adminLogin(otherPage);
  // login cookies carry whole seconds; one issued in the same second as the change would survive it
  await page.waitForTimeout(1100);

  await page.click("main nav >> text=Profil");
  await expect(page).toHaveURL(/\/admin\/profil$/);
  const change = async (current: string, next: string, again = next) => {
    await page.fill("#currentPassword", current);
    await page.fill("#password", next);
    await page.fill("#passwordAgain", again);
    // not "main button[type=submit]": the admin nav with "Log out" is inside <main> too
    await page.getByRole("button", { name: "Změnit heslo" }).click();
  };
  await change("wrong-password", "brand-new-password");
  await expect(page.locator("main")).toContainText("Současné heslo nesouhlasí");
  await change(E2E.adminUserPassword, "brand-new-password", "something-else");
  await expect(page.locator("main")).toContainText("Hesla se neshodují");
  await change(E2E.adminUserPassword, "brand-new-password");
  await expect(page.locator("main")).toContainText("Heslo je změněné");

  // this device stays signed in, the other one is logged out
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
  await otherPage.goto("/admin");
  await expect(otherPage).toHaveURL(/\/admin\/login$/);
  await other.close();

  // only the new password works now
  await page.click("main nav button:has-text('Odhlásit')");
  await page.goto("/admin/login");
  await page.fill("#email", E2E.adminEmail);
  await page.fill("#password", E2E.adminUserPassword);
  await page.click("main button[type=submit]");
  await expect(page.locator("main")).toContainText("Nesprávný e-mail nebo heslo");
  await adminLogin(page, { email: E2E.adminEmail, password: "brand-new-password" });
});

test("admin: a device logs in with a QR code approved on a phone; the phone logs out every other device", async ({ browser, page }) => {
  await adminLogin(page); // the phone
  const ctx = await browser.newContext({ locale: "cs-CZ" });
  const tablet = await ctx.newPage();
  await tablet.goto("/admin/login");
  await tablet.getByRole("button", { name: "Přihlásit QR kódem z telefonu" }).click();
  const qr = tablet.getByTestId("qr-login");
  await expect(qr.getByRole("img", { name: "QR kód pro přihlášení" })).toBeVisible();
  const url = await qr.getAttribute("data-url");
  expect(url).toMatch(/\/admin\/qr\/[\w-]+$/);
  const path = new URL(url!).pathname;

  // the code alone logs nobody in: a browser that is not logged in cannot approve it
  const stranger = await browser.newContext({ locale: "cs-CZ" });
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(path);
  await expect(strangerPage.locator("main")).toContainText("musíš být do adminu přihlášený/á tady");
  await stranger.close();

  // the phone opens it from the profile's scan (here straight away) and approves
  await page.click("main nav >> text=Profil");
  await expect(page.getByRole("button", { name: "Naskenovat QR kód" })).toBeVisible();
  await page.goto(path);
  await expect(page.locator("h1")).toHaveText("Přihlásit zařízení?");
  await expect(page.getByTestId("qr-device")).toContainText("Chrome");
  await page.getByRole("button", { name: "Přihlásit zařízení" }).click();
  await expect(page.locator("main")).toContainText("Zařízení se během pár vteřin přihlásí");
  // the tablet notices and opens the admin; the code is used up
  await tablet.waitForURL(/\/admin$/, { timeout: 15_000 });
  await expect(tablet.locator("main nav")).toContainText("Profil");
  await page.goto(path);
  await expect(page.locator("main")).toContainText("Tento QR kód už neplatí");

  // a code nobody approved in time: the device offers a new one
  const late = await browser.newContext({ locale: "cs-CZ" });
  const latePage = await late.newPage();
  await latePage.goto("/admin/login");
  await latePage.getByRole("button", { name: "Přihlásit QR kódem z telefonu" }).click();
  await expect(latePage.getByTestId("qr-login").getByRole("img")).toBeVisible();
  await sql("update qr_logins set expires_at = now() - interval '1 minute' where approved_at is null");
  await expect(latePage.getByTestId("qr-login")).toContainText("Kód vypršel.");
  await expect(latePage.getByRole("button", { name: "Nový kód" })).toBeVisible();
  await late.close();

  // the phone logs out every other device and stays logged in itself
  // login cookies carry whole seconds; one issued in the same second as the logout would survive it
  await page.waitForTimeout(1100);
  await page.goto("/admin/profil");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Odhlásit ze všech ostatních zařízení" }).click();
  await expect(page.locator("main")).toContainText("Na ostatních zařízeních se bude potřeba přihlásit znovu");
  await tablet.goto("/admin");
  await expect(tablet).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
  await ctx.close();
});

test("admin: one-time new-password link for a forgotten password", async ({ browser, page }) => {
  await createAdminUser({ email: "org@example.com", password: "forgotten-password", nickname: "Zapomnětlivec", role: "organizer" });
  await adminLogin(page);
  await page.goto("/admin/ucty");
  await page.locator("tr", { hasText: "org@example.com" }).locator("button:has-text('Odkaz pro nové heslo')").click();
  const url = await page.getByTestId("reset-url").textContent();
  expect(url).toMatch(/\/admin\/nove-heslo\/[\w-]+$/);
  const path = new URL(url!).pathname;

  const ctx = await browser.newContext();
  const org = await ctx.newPage();
  const res = await org.goto(path);
  expect(res!.headers()["referrer-policy"]).toBe("strict-origin");
  await expect(org.locator("main")).toContainText("Zapomnětlivec (org@example.com)");
  await org.fill("#password", "remembered-password");
  await org.fill("#passwordAgain", "remembered-password");
  await org.click("main button[type=submit]");
  await org.waitForURL(/\/admin$/);
  await expect(org.locator("main nav")).toContainText("Zapomnětlivec");

  // the link works once; the old password is gone, the new one works
  await org.goto(path);
  await expect(org.locator("main")).toContainText("Odkaz neplatí");
  await ctx.close();
  const again = await browser.newContext();
  const login = await again.newPage();
  await login.goto("/admin/login");
  await login.fill("#email", "org@example.com");
  await login.fill("#password", "forgotten-password");
  await login.click("main button[type=submit]");
  await expect(login.locator("main")).toContainText("Nesprávný e-mail nebo heslo");
  await adminLogin(login, { email: "org@example.com", password: "remembered-password" });
  await again.close();
});

test("scripts/reset-link.mjs makes a working link when no administrator can log in", async ({ page, baseURL }) => {
  await createAdminUser();
  const out = execFileSync("node", ["scripts/reset-link.mjs", E2E.adminEmail], {
    env: { ...process.env, DATABASE_URL: E2E.databaseUrl, SITE_URL: baseURL! },
    encoding: "utf8",
  });
  const url = out.match(/http\S+\/admin\/nove-heslo\/\S+/)?.[0];
  expect(url).toBeTruthy();
  await page.goto(url!);
  await page.fill("#password", "recovered-password");
  await page.fill("#passwordAgain", "recovered-password");
  await page.click("main button[type=submit]");
  await page.waitForURL(/\/admin$/);
});

test("security headers: no framing anywhere, no referrer from secret-link pages", async ({ request }) => {
  const home = await request.get("/");
  expect(home.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  const edit = await request.get("/r/some-token");
  // only the origin, never the secret path; not "no-referrer" (forms would post with Origin: null)
  expect(edit.headers()["referrer-policy"]).toBe("strict-origin");
  expect(edit.headers()["x-frame-options"]).toBe("DENY");
});

test("admin: forgotten password – a one-time link by e-mail, the same answer for unknown addresses", async ({ page }) => {
  await createAdminUser();
  await page.goto("/admin/login");
  await page.click("main a:has-text('Zapomenuté heslo?')");
  await expect(page).toHaveURL(/\/admin\/zapomenute-heslo$/);

  // an unknown address gets the same answer and no link
  await page.fill("#email", "nobody@example.com");
  await page.click("main button[type=submit]");
  await expect(page.locator("main")).toContainText("odkaz pro nové heslo je na cestě");

  await page.goto("/admin/zapomenute-heslo");
  await page.fill("#email", E2E.adminEmail.toUpperCase());
  await page.click("main button[type=submit]");
  await expect(page.locator("main")).toContainText("odkaz pro nové heslo je na cestě");
  // the e-mail goes out after the answer
  await expect.poll(async () => (await sql("select id from password_resets")).length).toBe(1);
  const [reset] = await sql<{ token: string; valid_ms: number }>(
    "select token, extract(epoch from expires_at - created_at) * 1000 as valid_ms from password_resets",
  );
  expect(Number(reset.valid_ms)).toBe(2 * 3600_000);

  // asking again right away answers the same but sends nothing new
  await page.goto("/admin/zapomenute-heslo");
  await page.fill("#email", E2E.adminEmail);
  await page.click("main button[type=submit]");
  await expect(page.locator("main")).toContainText("odkaz pro nové heslo je na cestě");
  expect(await sql("select token from password_resets")).toEqual([{ token: reset.token }]);

  // the link sets a new password and logs in; the old password stops working
  await page.goto(`/admin/nove-heslo/${reset.token}`);
  await page.fill("#password", "brand-new-password-1");
  await page.fill("#passwordAgain", "brand-new-password-1");
  await page.click("main button[type=submit]");
  await page.waitForURL(/\/admin$/);
  await page.context().clearCookies();
  await adminLogin(page, { email: E2E.adminEmail, password: "brand-new-password-1" });
  // used up: the page offers a new one
  await page.context().clearCookies();
  await page.goto(`/admin/nove-heslo/${reset.token}`);
  await expect(page.locator("main")).toContainText("Odkaz neplatí");
  await expect(page.locator("main a:has-text('Poslat nový odkaz')")).toHaveAttribute("href", "/admin/zapomenute-heslo");
});

test("admin: log in with a one-time link from an e-mail, the same answer for unknown addresses", async ({ page }) => {
  await createAdminUser();
  await page.goto("/admin/login");
  await page.click("main a:has-text('Přihlásit odkazem z e-mailu')");
  await expect(page).toHaveURL(/\/admin\/odkaz$/);

  // an unknown address gets the same answer and no link
  await page.fill("#email", "nobody@example.com");
  await page.click("main button[type=submit]");
  await expect(page.locator("main")).toContainText("přihlašovací odkaz je na cestě");

  await page.goto("/admin/odkaz");
  await page.fill("#email", E2E.adminEmail.toUpperCase());
  await page.click("main button[type=submit]");
  await expect(page.locator("main")).toContainText("přihlašovací odkaz je na cestě");
  // the e-mail goes out after the answer
  await expect.poll(async () => (await sql("select id from login_links")).length).toBe(1);
  const [link] = await sql<{ token: string; valid_ms: number }>("select token, extract(epoch from expires_at - created_at) * 1000 as valid_ms from login_links");
  expect(Number(link.valid_ms)).toBe(15 * 60_000);

  // opening the link alone (as a mail scanner does) logs nobody in and does not use it up
  await page.goto(`/admin/odkaz/${link.token}`);
  await expect(page.locator("main")).toContainText("Přihlásíš se na tomto zařízení jako: Správce");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);

  // the button logs in, once
  await page.goto(`/admin/odkaz/${link.token}`);
  await page.click("main button[type=submit]");
  await page.waitForURL(/\/admin$/);
  await expect(page.locator("main nav")).toContainText("Profil");
  await page.context().clearCookies();
  await page.goto(`/admin/odkaz/${link.token}`);
  await expect(page.locator("main")).toContainText("Odkaz neplatí");
  await expect(page.locator("main a:has-text('Poslat nový odkaz')")).toHaveAttribute("href", "/admin/odkaz");

  // an expired link does not log in either
  await sql("update login_links set used_at = null, expires_at = now() - interval '1 minute'");
  await page.goto(`/admin/odkaz/${link.token}`);
  await expect(page.locator("main")).toContainText("Odkaz neplatí");
});

test("registration form keeps what was typed when the server refuses it; the honeypot saves nothing", async ({ page }) => {
  const id = await createSession({ capacity: 5 });
  await page.goto(`/botc/termin/${id}`);
  await page.fill("#nickname", "Pepa");
  await page.fill("#email", "pepa@example.com");
  await page.fill("#phone", "123");
  await page.selectOption("#arrivalTime", "19:30");
  await page.fill("#note", "přijdu s kamarádem");
  await page.click("main form button[type=submit]");
  await expect(page.locator("main")).toContainText("Zadej platné telefonní číslo");
  await expect(page.locator("#nickname")).toHaveValue("Pepa");
  await expect(page.locator("#email")).toHaveValue("pepa@example.com");
  await expect(page.locator("#arrivalTime")).toHaveValue("19:30");
  await expect(page.locator("#note")).toHaveValue("přijdu s kamarádem");

  // a bot filling the hidden field sees a success message, but nothing is saved
  await page.fill("#phone", "");
  await page.evaluate(() => ((document.getElementById("website") as HTMLInputElement).value = "https://spam.example"));
  await page.click("main form button[type=submit]");
  await expect(page.getByTestId("register-result")).toBeVisible();
  expect(await sql("select id from registrations")).toHaveLength(0);
});

test("a weekly series keeps its Prague time across the end of daylight saving time", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/novy");
  await page.fill("#title", "Podzimní série");
  // summer time ends on Sunday 26 October 2031
  await page.fill("#date", "2031-10-20");
  await page.selectOption("#startTime", "19:00");
  await page.selectOption("#endTime", "23:00");
  await page.fill("#place", "Klubovna");
  await page.selectOption("#repeatWeeks", "1");
  await page.fill("#repeatCount", "2");
  await page.click("button:has-text('Vytvořit termín')");
  await page.waitForURL(/\/admin$/);
  const rows = await sql<{ starts_at: Date }>("select starts_at from sessions where title = 'Podzimní série' order by starts_at");
  expect(rows.map((r) => r.starts_at.toISOString())).toEqual([
    "2031-10-20T17:00:00.000Z", // 19:00 CEST
    "2031-10-27T18:00:00.000Z", // 19:00 CET
  ]);
});

test("playlist: an organiser pastes a table of songs, players see it folded away on the session page", async ({ page }) => {
  const id = await createSession({ title: "Hudební večer", capacity: 5 });
  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  const paste = (html: string, text: string) =>
    page.locator("#playlistPaste").evaluate(
      (el, [h, t]) => {
        const data = new DataTransfer();
        if (h) data.setData("text/html", h);
        data.setData("text/plain", t);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      },
      [html, text],
    );

  // a table copied from a document or a web page keeps its links
  await paste(
    `<table><tr><th>#</th><th>Skladba</th><th>Autor</th><th>Licence</th><th>Stažení</th></tr>
      <tr><td>1</td><td>Clocktower</td><td>symphony</td><td>CC0</td><td><a href="https://example.com/clocktower.mp3">MP3</a> / <a href="https://example.com/clocktower">stránka ke stažení</a></td></tr>
      <tr><td>2</td><td>Vampire's Piano</td><td>TAD</td><td>CC0</td><td><a href="https://example.com/piano">MP3 / WAV ke stažení</a></td></tr>
      <tr><td>3</td><td>Bad link</td><td>X</td><td>CC0</td><td><a href="javascript:alert(1)">klik</a></td></tr></table>`,
    "1\tClocktower\tsymphony\tCC0\tMP3 / stránka ke stažení",
  );
  await expect(page.locator("main")).toContainText("Načteno skladeb: 3");
  // the preview has the same column headings players see, so a wrongly read column shows at once
  await expect(page.getByTestId("playlist-preview").locator("thead")).toHaveText(/#\s*Skladba\s*Autor\s*Licence\s*Stažení/);
  await page.getByTestId("playlist-preview").locator("tr:has-text('Bad link') button").click();
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("Uloženo.");
  const [s] = await sql<{ playlist: unknown }>("select playlist from sessions where id = $1", [id]);
  expect(s.playlist).toEqual([
    {
      title: "Clocktower",
      author: "symphony",
      license: "CC0",
      links: [
        { label: "MP3", url: "https://example.com/clocktower.mp3" },
        { label: "stránka ke stažení", url: "https://example.com/clocktower" },
      ],
    },
    { title: "Vampire's Piano", author: "TAD", license: "CC0", links: [{ label: "MP3 / WAV ke stažení", url: "https://example.com/piano" }] },
  ]);

  // players: one folded line, the songs and links after a click
  await page.goto(`/botc/termin/${id}`);
  const playlist = page.locator("main details", { hasText: "Playlist (2 skladby)" });
  const table = playlist.locator("table");
  await expect(table).toBeHidden();
  await playlist.locator("summary").click();
  // what each column means: headings on a wide screen, the licence explained below
  await expect(table.locator("thead")).toHaveText(/#\s*Skladba\s*Autor\s*Licence\s*Stažení/);
  await expect(table.locator("tbody tr").first()).toContainText("Clocktower");
  await expect(table.locator("a:has-text('MP3 / WAV ke stažení')")).toHaveAttribute("href", "https://example.com/piano");
  await expect(playlist).toContainText("CC0 znamená volné dílo");
  // on a phone each song says "Autor:", "Licence:", "Stažení:" instead
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(table).toBeHidden();
  await expect(playlist.locator("li").first()).toContainText("Autor: symphony · Licence: CC0");
  await expect(playlist.locator("li").first()).toContainText("Stažení: MP3");
  await page.setViewportSize({ width: 1280, height: 720 });

  // a markdown table from a chat works too; pasting again replaces the playlist, duplicating copies it
  await page.goto(`/admin/termin/${id}`);
  await paste("", "| # | Skladba | Autor | Licence | Stažení |\n|---|---|---|---|---|\n| 1 | Darkest Hour | Indieteur | CC0 | [MP3 / WAV](https://example.com/dark) |");
  await expect(page.getByTestId("playlist-preview").locator("tbody tr")).toHaveCount(1);
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("Uloženo.");
  await page.goto(`/admin/novy?from=${id}`);
  await expect(page.getByTestId("playlist-preview")).toContainText("Darkest Hour");
  await expect(page.getByTestId("playlist-preview").locator("table a")).toHaveAttribute("href", "https://example.com/dark");
});

test("quick sign-up in admin: a nickname is enough, a full session gets one more spot, ahead of the waitlist", async ({ page }) => {
  const id = await createSession({ capacity: 2 });
  await register(page, id, { nick: "A", email: "qa@example.com" });
  await register(page, id, { nick: "B", email: "qb@example.com" });
  await register(page, id, { nick: "C", email: "qc@example.com" });
  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  const main = page.locator("main");
  await expect(main).toContainText("Náhradníci (1)");
  await expect(main).toContainText("Termín je plný – s dalším hráčem se kapacita zvýší na 3.");
  await expect(page.getByRole("button", { name: "Poslat připomínku (2)" })).toBeVisible();

  // only the nickname: confirmed right away, the waitlisted player stays where they were
  await page.fill("#quick-nickname", "Kolemjdoucí");
  await page.click("button:has-text('Přidat hráče')");
  await expect(main).toContainText("Kolemjdoucí je na termínu. Termín byl plný, kapacita je teď 3.");
  await expect(main).toContainText("Přihlášení (3 / 3)");
  await expect(main).toContainText("Náhradníci (1)");
  await expect(page.locator("#quick-nickname")).toHaveValue("");
  const [walkIn] = await sql<{ status: string; email: string; edit_token: string; confirmation_sent_at: Date | null }>(
    "select status, email, edit_token, confirmation_sent_at from registrations where nickname='Kolemjdoucí'",
  );
  expect(walkIn.status).toBe("confirmed");
  expect(walkIn.email).toMatch(/@bez-emailu\.invalid$/);
  expect(walkIn.confirmation_sent_at).toBeNull();
  expect(await sql("select status from registrations where email='qc@example.com'")).toEqual([{ status: "waitlisted" }]);
  // no e-mail: none shown, no "confirmation not sent" warning, no reminder or broadcast to it
  await expect(main).not.toContainText("bez-emailu");
  await expect(main).not.toContainText("neodešel potvrzovací e-mail");
  await expect(page.getByRole("button", { name: "Poslat připomínku (2)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Odeslat přihlášeným (2)" })).toBeVisible();

  // an e-mail already on the session is refused
  await page.fill("#quick-nickname", "Áčko znovu");
  await page.fill("#quick-email", "QA@example.com");
  await page.click("button:has-text('Přidat hráče')");
  await expect(main).toContainText("Hráč s tímto e-mailem už na termínu je.");
  await expect(page.locator("#quick-nickname")).toHaveValue("Áčko znovu");

  // with an e-mail and more details: the usual confirmation goes out
  await page.fill("#quick-nickname", "Dora");
  await page.fill("#quick-email", "qd@example.com");
  await page.click("summary:has-text('Další údaje')");
  await page.fill("#quick-firstName", "Dorota");
  await page.check("#quick-isNewbie");
  await page.click("button:has-text('Přidat hráče')");
  await expect(main).toContainText("Dora je na termínu. Termín byl plný, kapacita je teď 4. Potvrzení odešlo e-mailem.");
  await expect(main).toContainText("Přihlášení (4 / 4)");
  const [dora] = await sql<{ first_name: string; is_newbie: boolean; status: string; sent: boolean }>(
    "select first_name, is_newbie, status, confirmation_sent_at is not null as sent from registrations where email='qd@example.com'",
  );
  expect(dora).toEqual({ first_name: "Dorota", is_newbie: true, status: "confirmed", sent: true });

  // the walk-in's own link works and shows no stand-in e-mail
  await page.goto(`/botc/r/${walkIn.edit_token}`);
  await expect(page.locator("#nickname")).toHaveValue("Kolemjdoucí");
  await expect(page.locator("#email")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("bez-emailu");
});

test("organiser edits a player with the pencil, also after the session; deleted data stays deleted", async ({ page, request }) => {
  const upcoming = await createSession({ title: "Příští večer", capacity: 5 });
  const past = await createSession({ title: "Nedávný večer", daysAhead: -3 });
  const old = await createSession({ title: "Dávný večer", daysAhead: -20 });
  const insert = async (sessionId: number, nickname: string, email: string) => {
    const [r] = await sql<{ id: number }>(
      "insert into registrations (session_id, nickname, email, edit_token, confirmation_sent_at) values ($1, $2, $3, $4, $5) returning id",
      // walk-ins added without an e-mail never got a confirmation
      [sessionId, nickname, email, `edit-${sessionId}-${nickname}`, email.endsWith("@bez-emailu.invalid") ? null : new Date()],
    );
    return r.id;
  };
  const main = page.locator("main");
  const form = page.getByTestId("edit-player-form");

  // before the session: an e-mail of another player is refused; a new address gets the confirmation
  const walkIn = await insert(upcoming, "Kolemjdoucí", "walkin-a@bez-emailu.invalid");
  await insert(upcoming, "Bára", "bara@example.com");
  await adminLogin(page);
  await page.goto(`/admin/termin/${upcoming}`);
  await page.getByRole("button", { name: "Upravit údaje hráče Kolemjdoucí" }).click();
  await expect(form).toContainText("Na nový e-mail přijde potvrzení");
  await expect(page.locator(`#player${walkIn}-email`)).toHaveValue("");
  await page.fill(`#player${walkIn}-nickname`, "Karel");
  await page.fill(`#player${walkIn}-email`, "BARA@example.com");
  await form.getByRole("button", { name: "Uložit" }).click();
  await expect(form).toContainText("Hráč s tímto e-mailem už na termínu je.");
  await expect(page.locator(`#player${walkIn}-nickname`)).toHaveValue("Karel");
  await page.fill(`#player${walkIn}-email`, "karel@example.com");
  await page.fill(`#player${walkIn}-phone`, "+420 777 111 222");
  await page.selectOption(`#player${walkIn}-arrivalTime`, "20:00");
  await page.check(`#player${walkIn}-isNewbie`);
  await form.getByRole("button", { name: "Uložit" }).click();
  await expect(main).toContainText("Karel: potvrzení odešlo na nový e-mail.");
  await expect(form).toHaveCount(0);
  const row = main.locator("tr", { hasText: "karel@example.com" });
  await expect(row).toContainText("Karel 🌱");
  await expect(row).toContainText("+420777111222");
  await expect(row).toContainText("20:00");
  expect(
    await sql("select nickname, email, phone, arrival_time, is_newbie, confirmation_sent_at is not null as sent from registrations where id=$1", [walkIn]),
  ).toEqual([{ nickname: "Karel", email: "karel@example.com", phone: "+420777111222", arrival_time: "20:00", is_newbie: true, sent: true }]);

  // after the session: everything can still be changed, nothing is e-mailed and no "confirmation not sent" warning
  const recent = await insert(past, "Honza", "walkin-b@bez-emailu.invalid");
  await page.goto(`/admin/termin/${past}`);
  await page.getByRole("button", { name: "Upravit údaje hráče Honza" }).click();
  await expect(form).not.toContainText("Na nový e-mail přijde potvrzení");
  await page.fill(`#player${recent}-nickname`, "Honzík");
  await page.fill(`#player${recent}-email`, "honza@example.com");
  await page.fill(`#player${recent}-firstName`, "Jan");
  await page.check(`#player${recent}-canStorytell`);
  await form.getByRole("button", { name: "Uložit" }).click();
  await expect(form).toHaveCount(0);
  const pastRow = main.locator("tr", { hasText: "honza@example.com" });
  await expect(pastRow).toContainText("Honzík 🎩");
  await expect(pastRow).toContainText("Jan");
  await expect(main).not.toContainText("potvrzení odešlo");
  await expect(main).not.toContainText("neodešel potvrzovací e-mail");
  expect(await sql("select confirmation_sent_at from registrations where id=$1", [recent])).toEqual([{ confirmation_sent_at: null }]);

  // 14 days after: name and phone stay deleted; a typed e-mail is kept only as the player's pseudonym, for the stats
  const older = await insert(old, "Kolemjdoucí", "walkin-c@bez-emailu.invalid");
  await request.get("/api/cron/reminders", { headers: { authorization: "Bearer e2e-cron" } });
  const [{ email: before }] = await sql<{ email: string }>("select email from registrations where id=$1", [older]);
  expect(before).toMatch(/@anonym\.invalid$/);
  await page.goto(`/admin/termin/${old}`);
  await page.getByRole("button", { name: "Upravit údaje hráče Kolemjdoucí" }).click();
  await expect(form).toContainText("Zadaný e-mail se neuloží");
  await expect(page.locator(`#player${older}-firstName`)).toHaveCount(0);
  await expect(page.locator(`#player${older}-phone`)).toHaveCount(0);
  await expect(page.locator(`#player${older}-email`)).toHaveValue("");
  await page.fill(`#player${older}-email`, "honza@example.com");
  await form.getByRole("button", { name: "Uložit" }).click();
  await expect(form).toHaveCount(0);
  await expect(main).not.toContainText("honza@example.com");
  const [{ email: after }] = await sql<{ email: string }>("select email from registrations where id=$1", [older]);
  expect(after).toMatch(/^[0-9a-f]{24}@anonym\.invalid$/);
  expect(after).not.toBe(before);
  await page.goto("/admin/statistiky");
  const stats = page.locator("main tr:has-text('Honzík')");
  await expect(stats).toHaveCount(1);
  await expect(stats.locator("td").nth(1)).toHaveText("honza@example.com");
  await expect(stats.locator("td").nth(2)).toHaveText("2");
});

test("who played what: a character or 'sat out' per player of each game, shown with icons in admin and the archive", async ({ page, request }) => {
  const id = await createSession({ title: "Večer s rolemi", capacity: 10, daysAhead: -3 });
  await sql("update sessions set scripts=$1 where id=$2", [JSON.stringify([{ name: "Trouble Brewing", url: "https://botcscripts.com/tb" }]), id]);
  const ids: Record<string, number> = {};
  for (const nick of ["Anna", "Bára", "Cyril", "Dan", "Eva", "Filip", "Gita"]) {
    const [r] = await sql<{ id: number }>(
      "insert into registrations (session_id, nickname, email, edit_token) values ($1, $2, $3, $4) returning id",
      [id, nick, `${nick.toLowerCase()}@example.com`, `roles-${nick}-${Date.now()}`],
    );
    ids[nick] = r.id;
  }
  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);

  // a new game: the roster is folded away; Trouble Brewing's characters come first, by team
  await page.click("form:has(#scriptPick) summary:has-text('Kdo co hrál')");
  const anna = page.locator(`#role-${ids.Anna}`);
  expect(await anna.locator("optgroup").evaluateAll((gs) => gs.map((g) => (g as HTMLOptGroupElement).label))).toEqual([
    "Měšťané", "Podivíni", "Přisluhovači", "Démoni", "Pocestní", "Ostatní postavy",
  ]);
  await anna.selectOption("washerwoman");
  await expect(page.locator(`form:has(#scriptPick) img[src='/botc/roles/washerwoman.webp']`)).toBeVisible();
  await page.selectOption(`#role-${ids["Bára"]}`, "imp");
  await page.selectOption(`#role-${ids.Cyril}`, { label: "Nehrál/a" });
  await page.selectOption("#winner", "good");
  await page.click("button:has-text('Přidat hru')");
  await expect(page.locator("main")).toContainText("Anna· Pradlena");
  await expect(page.locator("main")).toContainText("Bára· Čert");
  await expect(page.locator("main")).toContainText("Nehráli: Cyril");
  // the add form is empty again, roster included
  await expect(page.locator(`#role-${ids.Anna}`)).toHaveValue("");

  // editing: the roster is open with what was entered; Dan gets a character, Cyril ran the game
  const [game] = await sql<{ id: number }>("select id from games where session_id=$1", [id]);
  await page.locator("li", { hasText: "1.Trouble Brewing" }).getByRole("button", { name: "Upravit" }).click();
  await expect(page.locator(`#game${game.id}-role-${ids["Bára"]}`)).toHaveValue("imp");
  await page.selectOption(`#game${game.id}-role-${ids.Dan}`, "drunk");
  // the Drunk also gets who they thought they were – a Townsfolk, the script's first
  const believed = page.locator(`#game${game.id}-believed-${ids.Dan}`);
  expect(await believed.locator("optgroup").evaluateAll((gs) => gs.map((g) => (g as HTMLOptGroupElement).label))).toEqual(["Měšťané", "Ostatní postavy"]);
  await believed.selectOption("monk");
  await expect(page.locator(`#game${game.id}-believed-${ids["Bára"]}`)).toHaveCount(0);
  // the Pixie gets the in-play Townsfolk she learned
  await page.selectOption(`#game${game.id}-role-${ids.Eva}`, "pixie");
  await expect(page.locator(`label[for=game${game.id}-believed-${ids.Eva}]`)).toHaveText("zná");
  await page.selectOption(`#game${game.id}-believed-${ids.Eva}`, "chef");
  // the Philosopher gets whose ability he took – a good character
  await page.selectOption(`#game${game.id}-role-${ids.Filip}`, "philosopher");
  await expect(page.locator(`label[for=game${game.id}-believed-${ids.Filip}]`)).toHaveText("schopnost");
  await expect(page.locator(`#game${game.id}-believed-${ids.Filip} option[value=imp]`)).toHaveCount(0);
  await page.selectOption(`#game${game.id}-believed-${ids.Filip}`, "monk");
  // the Apprentice takes a Townsfolk's or a Minion's ability
  await page.selectOption(`#game${game.id}-role-${ids.Gita}`, "apprentice");
  expect(await page.locator(`#game${game.id}-believed-${ids.Gita} optgroup`).evaluateAll((gs) => gs.map((g) => (g as HTMLOptGroupElement).label))).toEqual([
    "Měšťané", "Přisluhovači", "Ostatní postavy",
  ]);
  await page.selectOption(`#game${game.id}-believed-${ids.Gita}`, "baron");
  await page.selectOption(`#game${game.id}-role-${ids.Cyril}`, { label: "🎩 Vypravěč" });
  // the Demon's bluffs: good characters only
  await expect(page.locator(`#game${game.id}-bluff1 option[value=imp]`)).toHaveCount(0);
  await page.selectOption(`#game${game.id}-bluff1`, "chef");
  await page.selectOption(`#game${game.id}-bluff2`, "empath");
  await page.selectOption(`#game${game.id}-bluff3`, "saint");
  await page.locator(`form:has(#game${game.id}-players)`).getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.locator("main")).toContainText("Dan· Opilec (jako Mnich)");
  await expect(page.locator("main")).toContainText("🎩Vypravěč: Cyril");
  await expect(page.locator("main")).not.toContainText("Nehráli");
  expect(await sql("select demon_bluffs from games where id=$1", [game.id])).toEqual([{ demon_bluffs: ["chef", "empath", "saint"] }]);
  expect(await sql("select registration_id, role, believed_role from game_players where game_id=$1 order by registration_id", [game.id])).toEqual([
    { registration_id: ids.Anna, role: "washerwoman", believed_role: null },
    { registration_id: ids["Bára"], role: "imp", believed_role: null },
    { registration_id: ids.Cyril, role: "storyteller", believed_role: null },
    { registration_id: ids.Dan, role: "drunk", believed_role: "monk" },
    { registration_id: ids.Eva, role: "pixie", believed_role: "chef" },
    { registration_id: ids.Filip, role: "philosopher", believed_role: "monk" },
    { registration_id: ids.Gita, role: "apprentice", believed_role: "baron" },
  ]);

  // the public archive shows who played what, with the icons and their credit
  await page.goto("/botc/archiv");
  const card = page.locator("li", { hasText: "Večer s rolemi" });
  // the signed-in organiser gets a pencil straight to the session's games
  await expect(card.getByTestId("edit-pencil")).toHaveAttribute("href", `/admin/termin/${id}#hry`);
  // each game in its own box: the storyteller, then the players by side
  await expect(card).toContainText("Hra 1 · Trouble Brewing😇 vyhrálo dobro🎩Vypravěč: Cyril");
  await expect(card).toContainText("Dobro 4Anna· PradlenaEva· Víla (zná: Kuchař)Filip· Filozof (schopnost: Mnich)Dan· Opilec (jako Mnich)");
  await expect(card).toContainText("Zlo 1Bára· Čert");
  await expect(card).toContainText("Pocestní 1Gita· Učedník (schopnost: Baron)");
  await expect(card).toContainText("BluffyKuchařEmpatSvětec");
  await expect(card.locator("img[src='/botc/roles/saint.webp']")).toBeVisible();
  await expect(card.locator("img[src='/botc/roles/imp.webp']")).toBeVisible();
  await expect(page.locator("main")).toContainText("The Pandemonium Institute");
  await card.getByTestId("edit-pencil").click();
  await page.waitForURL(`**/admin/termin/${id}#hry`);
  await expect(page.locator("#hry")).toBeInViewport();
  // players see no pencil
  await page.context().clearCookies();
  await page.goto("/botc/archiv");
  await expect(page.locator("li", { hasText: "Večer s rolemi" })).toContainText("Anna· Pradlena");
  await expect(page.getByTestId("edit-pencil")).toHaveCount(0);
  const icon = await request.get("/botc/roles/imp.webp");
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toBe("image/webp");
});

test("storytellers: how often each one ran a game, from the games' rosters, in admin and the stats", async ({ page }) => {
  const first = await createSession({ title: "Starší večer", daysAhead: -10 });
  const second = await createSession({ title: "Minulý večer", daysAhead: -3 });
  const next = await createSession({ title: "Příští večer", capacity: 10 });
  const signUp = async (session: number, nickname: string, canStorytell = false) =>
    (await sql<{ id: number }>(
      "insert into registrations (session_id, nickname, email, edit_token, can_storytell) values ($1, $2, $3, $4, $5) returning id",
      [session, nickname, `${nickname.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()}@example.com`, `st-${session}-${nickname}`, canStorytell],
    ))[0].id;
  const game = async (session: number, script: string, winner: "good" | "evil", storytellers: number[]) => {
    const [{ id }] = await sql<{ id: number }>("insert into games (session_id, script_name, winner) values ($1, $2, $3) returning id", [session, script, winner]);
    for (const r of storytellers) await sql("insert into game_players (game_id, registration_id, role) values ($1, $2, 'storyteller')", [id, r]);
  };
  const honza1 = await signUp(first, "Honza");
  const honza2 = await signUp(second, "Honza");
  const petra2 = await signUp(second, "Petra");
  await game(first, "Trouble Brewing", "good", [honza1]);
  await game(first, "Trouble Brewing", "evil", [honza1]);
  // two storytellers ran one game together
  await game(second, "Bad Moon Rising", "good", [honza2, petra2]);
  // the session's storyteller text only says who was meant to run it; it does not count
  await sql("update sessions set storyteller = 'Petra' where id = $1", [next]);
  await signUp(next, "Honza", true);
  await signUp(next, "Nováček", true);
  await signUp(next, "Hráč");

  await adminLogin(page);
  await page.goto(`/admin/termin/${next}`);
  await expect(page.locator("tr:has-text('honza@example.com')")).toContainText(/🎩 vyprávěl\/a 3 hry · naposledy \S+ \d+\. \d+\./);
  await expect(page.locator("tr:has-text('novacek@example.com')")).toContainText("🎩 zatím nevyprávěl/a");
  await expect(page.locator("tr:has-text('hrac@example.com')")).not.toContainText("vyprávěl");

  await page.goto("/admin/statistiky");
  const rows = page.locator("section:has(h2:has-text('Vypravěči')) tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator("td")).toHaveText([
    "Honza", "2", "3", /\d{4}$/, "2 / 1", "Trouble Brewing 2×, Bad Moon Rising 1×",
  ]);
  await expect(rows.nth(1).locator("td")).toHaveText(["Petra", "1", "1", /\d{4}$/, "1 / 0", "Bad Moon Rising 1×"]);
});

test("admin menu groups the sections and marks the current page", async ({ page }) => {
  const id = await createSession({ title: "Menu večer" });
  await adminLogin(page);
  const current = page.locator("main nav a[aria-current=page]");
  await expect(current).toHaveText("Termíny");
  await page.goto(`/admin/termin/${id}`);
  await expect(current).toHaveText("Termíny");
  await page.click("main nav a:has-text('Statistiky')");
  await expect(current).toHaveText("Statistiky");
  await page.click("main nav a:has-text('Texty webu')");
  await expect(page).toHaveURL(/\/admin\/web$/);
  await expect(current).toHaveText("Texty webu");
  await page.click("main nav a:has-text('Účty')");
  await expect(current).toHaveText("Účty");
  await page.goto("/admin");
  await page.click("main a:has-text('+ Nový termín')");
  await expect(page).toHaveURL(/\/admin\/novy$/);
  await expect(current).toHaveText("Termíny");
});

test("news: the changelog in the admin, a dot in the menu until it is read on this device", async ({ page }) => {
  await adminLogin(page);
  const dot = page.getByTestId("news-dot");
  await expect(dot).toBeVisible();
  await page.click("main nav a:has-text('Novinky')");
  await expect(page.locator("main nav a[aria-current=page]")).toContainText("Novinky");
  await expect(page.locator("h1")).toHaveText("Novinky");
  await expect(page.getByTestId("news-entry").last()).toContainText("Spuštění");
  await expect(dot).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.locator("main nav a:has-text('Novinky')")).toBeVisible();
  await expect(dot).toHaveCount(0);
});

test("site texts: an organiser edits the club page in the admin, with history, conflicts and the original text", async ({ page, browser }) => {
  await createAdminUser({ email: "org@example.com", password: "org-password-123", nickname: "Organizátorka", role: "organizer" });
  await adminLogin(page, { email: "org@example.com", password: "org-password-123" });

  // the pencil on the public page leads to the page's texts in the language shown
  await page.goto("/");
  await page.getByTestId("edit-pencil").click();
  await expect(page).toHaveURL(/\/admin\/web\/klub\?lang=cs$/);
  await expect(page.locator("main nav a[aria-current=page]")).toHaveText("Texty webu");
  await expect(page.locator("#text-klub-intro")).toHaveValue("Kdy a kde hrajeme, jak se přihlásit na hry a jak to u nás chodí.");

  // another admin has the same page open
  const other = await browser.newContext({ locale: "cs-CZ" });
  const p2 = await other.newPage();
  await adminLogin(p2);
  await p2.goto("/admin/web/klub");

  // a one-line text and a formatted one (typed into the editor)
  await page.fill("#text-klub-intro", "Hrajeme deskovky každé úterý a čtvrtek.");
  const discordText = page.locator("section[aria-labelledby=text-klub-discordText-label] [contenteditable=true]");
  await discordText.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Přidej se!");
  await page.click("main button:has-text('Uložit')");
  await expect(page.getByRole("status")).toHaveText("Uloženo, na webu už je nová verze.");
  await expect(page.locator("section[aria-labelledby=text-klub-intro-label]")).toContainText("upraveno");
  await expect(page.locator("section[aria-labelledby=text-klub-intro-label]")).toContainText("Organizátorka");

  await page.goto("/");
  await expect(page.locator("main")).toContainText("Hrajeme deskovky každé úterý a čtvrtek.");
  await expect(page.locator("main")).toContainText("Zatím se přes něj přihlašuješ i na klubová hraní. Přidej se!");
  await expect(page.locator("meta[name=description]")).toHaveAttribute("content", "Hrajeme deskovky každé úterý a čtvrtek.");
  // the other language keeps its own texts
  await page.click("header button:has-text('English')");
  await expect(page.locator("main")).toContainText("A board game club in Olomouc");
  await page.click("header button:has-text('Česky')");

  // the other admin started from the old version: nothing of theirs is saved, what they typed stays
  await p2.fill("#text-klub-intro", "Úplně jiný podnadpis");
  await p2.click("main button:has-text('Uložit')");
  await expect(p2.locator("main")).toContainText("Text „Podnadpis“ mezitím uložil/a Organizátorka. Nic se neuložilo");
  await expect(p2.locator("#text-klub-intro")).toHaveValue("Úplně jiný podnadpis");
  await other.close();

  // a second version, then the first one comes back from the history
  await page.goto("/admin/web/klub");
  await page.fill("#text-klub-intro", "Druhá verze podnadpisu");
  await page.click("main button:has-text('Uložit')");
  await expect(page.getByRole("status")).toHaveText("Uloženo, na webu už je nová verze.");
  const intro = page.locator("section[aria-labelledby=text-klub-intro-label]");
  await intro.locator("summary:has-text('Historie (2)')").click();
  page.once("dialog", (d) => d.accept());
  await intro.locator("li", { hasText: "Hrajeme deskovky" }).locator("button:has-text('Vrátit tuto verzi')").click();
  await expect(page.getByRole("status")).toHaveText("Hotovo, text je vrácený.");
  await expect(page.locator("#text-klub-intro")).toHaveValue("Hrajeme deskovky každé úterý a čtvrtek.");

  // back to the text from the code; every step stays in the history
  page.once("dialog", (d) => d.accept());
  await page.locator("section[aria-labelledby=text-klub-intro-label] button:has-text('Vrátit původní text')").click();
  await expect(page.getByRole("status")).toHaveText("Hotovo, text je vrácený.");
  await expect(page.locator("#text-klub-intro")).toHaveValue("Kdy a kde hrajeme, jak se přihlásit na hry a jak to u nás chodí.");
  await expect(page.locator("section[aria-labelledby=text-klub-intro-label] summary")).toHaveText("Historie (4)");
  // saving without changes adds nothing
  await page.click("main button:has-text('Uložit')");
  await expect(page.getByRole("status")).toHaveText("Nic se nezměnilo.");
  expect((await sql("select id from site_texts where key='klub.intro'")).length).toBe(4);

  await page.goto("/admin/web");
  await expect(page.locator("main a", { hasText: "/botc/o-hre" })).toContainText("Zatím původní texty");
  await expect(page.locator("main a", { hasText: "Úvodní stránka webu" })).toContainText("Organizátorka");
});

test("site texts: HTML, scripts, images and javascript: links from the admin never reach the page", async ({ page }) => {
  await sql("insert into site_texts (key, locale, body) values ('o-hre.body', 'cs', $1)", [
    "## Nadpis z adminu\n\n<script>window.hacked = 1</script>\n\n<b onclick=\"x()\">tučně</b> [odkaz](javascript:alert(1)) ![obrázek](https://example.com/x.png)\n\n- 🎲 Hrajeme\n- 🍕 Jíme\n\n[Termíny](/botc) a [web](https://example.com)",
  ]);
  await page.goto("/botc/o-hre");
  await expect(page.locator("main h2").first()).toHaveText("Nadpis z adminu");
  expect(await page.evaluate(() => (window as unknown as { hacked?: number }).hacked)).toBeUndefined();
  await expect(page.locator("main script")).toHaveCount(0);
  await expect(page.locator("main b")).toHaveCount(0);
  await expect(page.locator("main img")).toHaveCount(0);
  await expect(page.locator("main article a:text-is('odkaz')")).not.toHaveAttribute("href", /javascript/);
  // emoji are the bullets; links to this site stay in the tab, others open a new one
  await expect(page.locator("main ul", { hasText: "Hrajeme" })).not.toHaveClass(/list-disc/);
  await expect(page.locator("main article a:text-is('Termíny')")).not.toHaveAttribute("target");
  await expect(page.locator("main article a:text-is('web')")).toHaveAttribute("target", "_blank");
  // the English page is untouched
  await page.click("header button:has-text('English')");
  await expect(page.locator("main h2").first()).toHaveText("What is Blood on the Clocktower");
});

test("script vote: organisers offer scripts, players vote through their sign-up link, only counts are public", async ({ page }) => {
  const id = await createSession({ title: "Hlasovací večer", capacity: 5 });
  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  // a link is optional, the same name twice is offered once
  await page.getByLabel("Script k hlasování 1", { exact: true }).fill("Trouble Brewing");
  await page.getByLabel("Odkaz na script k hlasování 1", { exact: true }).fill("botcscripts.com/tb");
  await page.click("button:has-text('+ Přidat script k hlasování')");
  await page.getByLabel("Script k hlasování 2", { exact: true }).fill("Sects & Violets");
  await page.click("button:has-text('+ Přidat script k hlasování')");
  await page.getByLabel("Script k hlasování 3", { exact: true }).fill("trouble brewing");
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("Uloženo.");
  const [s] = await sql<{ script_poll: unknown }>("select script_poll from sessions where id = $1", [id]);
  expect(s.script_poll).toEqual([
    { name: "Trouble Brewing", url: "https://botcscripts.com/tb" },
    { name: "Sects & Violets", url: "" },
  ]);

  await register(page, id, { nick: "Anna", email: "anna@example.com" });
  await register(page, id, { nick: "Bob", email: "bob@example.com" });
  const token = async (email: string) =>
    (await sql<{ edit_token: string }>("select edit_token from registrations where email = $1", [email]))[0].edit_token;

  // Anna votes for both, Bob for one; the counts follow right away
  await page.goto(`/botc/r/${await token("anna@example.com")}`);
  const vote = page.getByTestId("script-vote");
  await expect(vote).toContainText("Hlasování o scriptu");
  await expect(vote.locator("a:has-text('zobrazit script')")).toHaveAttribute("href", "https://botcscripts.com/tb");
  await vote.getByLabel("Trouble Brewing").check();
  await vote.getByLabel("Sects & Violets").check();
  await vote.locator("button:has-text('Uložit hlas')").click();
  await expect(vote).toContainText("Hlas uložen.");
  await expect(vote.locator("li", { hasText: "Sects & Violets" })).toContainText("1 hlas");

  await page.goto(`/botc/r/${await token("bob@example.com")}`);
  await vote.getByLabel("Sects & Violets").check();
  await vote.locator("button:has-text('Uložit hlas')").click();
  await expect(vote.locator("li", { hasText: "Sects & Violets" })).toContainText("2 hlasy");
  await expect(vote.locator("li", { hasText: "Trouble Brewing" })).toContainText("1 hlas");
  // the vote is kept: after a reload the boxes are still ticked
  await page.reload();
  await expect(vote.getByLabel("Sects & Violets")).toBeChecked();
  await expect(vote.getByLabel("Trouble Brewing")).not.toBeChecked();

  // the public session page: counts, most votes first, no names
  await page.goto(`/botc/termin/${id}`);
  const summary = page.getByTestId("script-poll");
  await expect(summary).toContainText("Hlasuje se, který script se bude hrát");
  await expect(summary.locator("li").first()).toHaveText("Sects & Violets · 2 hlasy");
  await expect(summary).not.toContainText("Anna");

  // admin: who voted for what; ending the vote is refused even from a page left open
  await page.goto(`/admin/termin/${id}`);
  const card = page.locator("#hlasovani");
  await expect(card).toContainText("Hlasovalo 2 z 2 přihlášených a náhradníků.");
  await expect(card.locator("li", { hasText: "Sects & Violets" })).toContainText("Anna, Bob");
  await page.goto(`/botc/r/${await token("anna@example.com")}`);
  await sql("update sessions set script_poll_closed_at = now() where id = $1", [id]);
  await vote.getByLabel("Trouble Brewing").uncheck();
  await vote.locator("button:has-text('Uložit hlas')").click();
  await expect(vote).toContainText("Hlasování už skončilo.");
  await page.reload();
  await expect(vote).toContainText("Hlasování skončilo");
  await expect(vote.getByLabel("Trouble Brewing")).toBeDisabled();
  await expect(vote.getByLabel("Trouble Brewing")).toBeChecked();
  await expect(vote.locator("button")).toHaveCount(0);

  // reopening from the admin; a cancelled player's vote stops counting
  await page.goto(`/admin/termin/${id}`);
  await expect(card).toContainText("Hlasování je ukončené");
  await card.locator("button:has-text('Znovu otevřít hlasování')").click();
  await expect(card.locator("button:has-text('Ukončit hlasování')")).toBeVisible();
  await sql("update registrations set status = 'cancelled' where email = 'bob@example.com'");
  await page.goto(`/botc/termin/${id}`);
  await expect(summary.locator("li", { hasText: "Sects & Violets" })).toContainText("1 hlas");

  // duplicating offers the same scripts, without the votes
  await page.goto(`/admin/novy?from=${id}`);
  await expect(page.getByLabel("Script k hlasování 2", { exact: true })).toHaveValue("Sects & Violets");
});
