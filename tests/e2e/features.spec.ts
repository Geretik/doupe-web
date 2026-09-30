import { expect, test } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { createMyGamesToken } from "../../src/lib/my-games-token";
import { adminLogin, createSession, register, resetDb, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
});

test("waitlist: full session queues players, cancellation promotes the first one", async ({ page }) => {
  const id = await createSession({ capacity: 1 });
  await register(page, id, { nick: "First", email: "first@example.com" });

  // second player lands on the waitlist
  await page.goto(`/termin/${id}`);
  await expect(page.locator("main")).toContainText("Zapsat se jako náhradník");
  const text = await register(page, id, { nick: "Second", email: "second@example.com" });
  expect(text).toContain("Jsi na seznamu náhradníků jako č. 1");
  const t3 = await register(page, id, { nick: "Third", email: "third@example.com" });
  expect(t3).toContain("náhradníků jako č. 2");

  await page.goto(`/termin/${id}`);
  await expect(page.locator("main")).toContainText("Náhradníci (2)");
  await page.goto("/");
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
  await page.goto(`/termin/${id}`);
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

  // admin override confirms beyond capacity
  await page.click("li:has-text('c@example.com') button:has-text('Potvrdit')");
  await expect(page.locator("main")).toContainText("Přihlášení (3 / 2)");
});

test("storyteller / newbie flags are stored and shown", async ({ page }) => {
  const id = await createSession({ capacity: 5 });
  await page.goto(`/termin/${id}`);
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
  await page.goto(`/termin/${id}`);
  await expect(page.locator("main li:has-text('Sára')")).toContainText("🎩");

  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  await expect(page.locator("main")).toContainText("vypravěči: 1");
  await expect(page.locator("main")).toContainText("nováčci: 1");
});

test("calendar: per-session .ics, feed and Google link", async ({ page, request }) => {
  const id = await createSession({ title: "Kalendářový večer", capacity: 3 });
  const res = await request.get(`/termin/${id}/kalendar.ics`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = await res.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("SUMMARY:BotC: Kalendářový večer");
  expect(body).toContain("LOCATION:Klubovna");
  expect(body).toContain(`UID:session-${id}@`);

  const feed = await request.get("/kalendar.ics");
  expect(feed.status()).toBe(200);
  expect(await feed.text()).toContain("Kalendářový večer");

  await page.goto(`/termin/${id}`);
  await expect(page.locator("main")).toContainText("Přidat do kalendáře");
  const google = await page.locator("main a:has-text('Google Kalendář')").getAttribute("href");
  expect(google).toContain("calendar.google.com/calendar/render");
  expect(google).toContain("Kalend");

  expect((await request.get("/termin/999999/kalendar.ics")).status()).toBe(404);
});

test("reminders: cron is protected, sends once per player within the window", async ({ request, page }) => {
  const soon = await createSession({ title: "Zítra", capacity: 5, daysAhead: 1 });
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
  await page.click("button:has-text('Odeslat 2 přihlášeným')");
  await expect(page.locator("main")).toContainText("Odesláno 2 e-mailů");
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
  const startsAt = await page.locator("#startsAt").inputValue();
  const expectedDay = new Date(orig.starts_at.getTime() + 7 * 864e5);
  expect(new Date(startsAt + ":00").toISOString().slice(0, 10)).toBe(
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
  await page.goto("/archiv");
  await expect(page.locator("h1")).toHaveText("Archiv");
  await expect(page.locator("main")).toContainText("Dávný večer");
  await expect(page.locator("main")).toContainText("1 hráč");
  await expect(page.locator("main")).not.toContainText("Budoucí večer");
  await page.goto(`/termin/${pastId}`);
  await expect(page.locator("main")).toContainText("Tento termín už proběhl");
  await expect(page.locator("main")).not.toContainText("Přidat do kalendáře");
});

test("open graph metadata on session page", async ({ page }) => {
  const id = await createSession({ title: "OG večer", capacity: 5 });
  await page.goto(`/termin/${id}`);
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
  await page.fill("#endsAt", "2020-01-01T10:00");
  await page.click("button:has-text('Save changes')");
  await expect(page.locator("main")).toContainText("The end must be after the start");

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
  // the form is reset after every submit, so fill it completely each time
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

  await page.goto("/");
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

  // admin: deleted data is not shown; stats still see one player with two sessions
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
});

test("sitemap lists public pages and upcoming sessions; robots.txt keeps admin and personal links out", async ({ page }) => {
  const upcoming = await createSession({ title: "Budoucí", daysAhead: 5 });
  const past = await createSession({ title: "Minulý", daysAhead: -5 });
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/klub</loc>");
  expect(sitemap).toContain(`/termin/${upcoming}</loc>`);
  expect(sitemap).not.toContain(`/termin/${past}</loc>`);
  expect(sitemap).not.toContain("/admin");

  const robots = await (await page.request.get("/robots.txt")).text();
  for (const path of ["/admin", "/api/", "/r/", "/moje-hry/"]) expect(robots).toContain(`Disallow: ${path}\n`);
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
  await page.goto(`/termin/${id}`);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.click("main button:has-text('Sdílet termín')");
  await expect(page.locator("main button:has-text('Odkaz zkopírován')")).toBeVisible();
  // only the path: NEXT_PUBLIC_SITE_URL is inlined at build time
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/termin/${id}$`));
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
  await anon.close();

  const cron = await page.request.get("/api/cron/reminders");
  expect(cron.ok()).toBeTruthy();
  expect(await cron.json()).toMatchObject({ reminders: expect.any(Object), spots: { posted: 0 } });
});

test("recurring sessions, games record shown in archive and stats", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/novy");
  await page.fill("#title", "Úterky");
  await page.fill("#startsAt", "2031-03-04T18:00");
  await page.fill("#endsAt", "2031-03-04T22:00");
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

  await page.goto("/archiv");
  await expect(page.locator("main")).toContainText("Trouble Brewing · 😇 vyhrálo dobro · 9 hráčů");
  await expect(page.locator("main")).toContainText("Bad Moon Rising · 😈 vyhrálo zlo");

  await page.goto("/admin/statistiky");
  await expect(page.locator("main")).toContainText("Her celkem2");
  await expect(page.locator("main")).toContainText("Trouble Brewing11 / 0");
});

test("my games: magic link lists the player's sign-ups", async ({ page }) => {
  const id = await createSession({ title: "Můj večer", capacity: 4 });
  await register(page, id, { nick: "Já", email: "me@example.com" });

  // requesting a link always answers the same way
  await page.goto("/moje-hry");
  await page.fill("#email", "me@example.com");
  await page.click("main button[type=submit]");
  await expect(page.locator("main")).toContainText("odkaz ti přišel");

  process.env.ADMIN_SECRET = "e2e-secret"; // same as the e2e server, so the token verifies
  await page.goto(`/moje-hry/${createMyGamesToken("me@example.com")}`);
  await expect(page.locator("h1")).toHaveText("Moje hry");
  await expect(page.locator("main")).toContainText("Můj večer");
  await expect(page.locator("main")).toContainText("přihlášen/a");
  await expect(page.locator("main a:has-text('Upravit / zrušit')")).toBeVisible();

  await page.goto("/moje-hry/neplatny.token.xyz");
  await expect(page.locator("main")).toContainText("Odkaz je neplatný");
});

test("tables: create, auto-assign with a storyteller per table, manual move, e-mail", async ({ page }) => {
  const id = await createSession({ title: "Velký večer", capacity: 20 });
  for (let i = 1; i <= 4; i++) {
    await sql(
      "insert into registrations (session_id, first_name, last_name, nickname, email, status, can_storytell, edit_token) values ($1,'P',$2,$3,$4,'confirmed',$5,$6)",
      [id, `L${i}`, `Hráč${i}`, `t${i}@example.com`, i <= 2, `tok-${i}-${id}`],
    );
  }
  await adminLogin(page);
  await page.goto(`/admin/termin/${id}`);
  await page.click("button:has-text('Vytvořit 2 stoly')");
  await expect(page.locator("main")).toContainText("Stůl 1 · 2");
  await expect(page.locator("main")).toContainText("Stůl 2 · 2");
  // both willing storytellers ended up on different tables
  const byTable = await sql<{ number: number; storytellers: number }>(
    "select t.number, count(*) filter (where r.can_storytell)::int as storytellers from tables t join registrations r on r.table_id=t.id where t.session_id=$1 group by t.number order by t.number",
    [id],
  );
  expect(byTable.map((r) => r.storytellers)).toEqual([1, 1]);
  await expect(page.locator("main")).toContainText("málo hráčů (min. 7)");

  // move one player by hand
  const t2 = await sql<{ id: number }>("select id from tables where session_id=$1 and number=2", [id]);
  await page.selectOption("tr:has-text('t1@example.com') select", String(t2[0].id));
  await expect(page.locator("main")).toContainText("Stůl 2 · 3");

  page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('Poslat rozdělení e-mailem (4)')");
  await expect(page.locator("main")).toContainText("Rozdělení odesláno 4×");
  await expect(page.locator("main")).toContainText("e-maily odeslány");
});

test("phone is optional but validated, normalised and shown only to organisers; hourly presence overview", async ({ page }) => {
  const id = await createSession({ capacity: 5 });
  // invalid phone → validation error, nothing saved
  await page.goto(`/termin/${id}`);
  await page.fill("#nickname", "Bez");
  await page.fill("#email", "bez@example.com");
  await page.fill("#phone", "abc");
  await page.click("main form button[type=submit]");
  await expect(page.locator("main")).toContainText("Zadej platné telefonní číslo");
  expect(await sql("select id from registrations where email='bez@example.com'")).toHaveLength(0);

  // only nickname and e-mail are required: name and phone may stay empty
  const other = await createSession({ capacity: 5 });
  await page.goto(`/termin/${other}`);
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
  await page.goto(`/termin/${id}`);
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
  await page.goto(`/termin/${id}`);
  await expect(page.locator("#arrivalTime")).toHaveCount(0);
  await expect(page.locator("#arrivesLate")).toBeVisible();
  await expect(page.locator("main")).toContainText("pouze kvůli pořádání tohoto konkrétního hraní");
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

test("club page: schedule, place and Discord sign-up, linked from the header, in both languages", async ({ page }) => {
  await page.goto("/");
  await page.click("header nav a:has-text('Klub')");
  await expect(page).toHaveURL(/\/klub$/);
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
