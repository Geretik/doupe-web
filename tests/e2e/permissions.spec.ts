import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { adminLogin, createAdminUser, createSession, register, resetDb, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
});

/** Who the e-mails about a session go to, asked the way lib/alerts asks when a player cancels late. */
async function recipients(sessionId: number) {
  process.env.DATABASE_URL ??= E2E.databaseUrl;
  const { sessionEmailRecipients } = await import("../../src/lib/alerts");
  return (await sessionEmailRecipients(sessionId)).map((r) => r.email).sort();
}

/** A select of the accounts table, e.g. "Krvavka" of the account with this e-mail */
function accountSelect(page: Page, email: string, label: "Role" | "Krvavka" | "Klub") {
  return page.locator("tr", { hasText: email }).getByLabel(new RegExp(`^${label}:`));
}

async function setAccess(page: Page, email: string, label: "Role" | "Krvavka" | "Klub", value: string) {
  const row = page.locator("tr", { hasText: email });
  await accountSelect(page, email, label).selectOption(value);
  await expect(row.getByTestId("access-status")).toHaveText("Uloženo");
}

test("accounts: the administrator changes roles and what organisers see and edit in Krvavka and the club", async ({ browser, page }) => {
  const id = await createSession({ title: "Večer pro čtenáře", capacity: 4 });
  await register(page, id, { nick: "Hráčka", email: "hracka@example.com" });
  await createAdminUser({ email: "org@example.com", password: "organizatorka-heslo", nickname: "Organizátorka", role: "organizer" });
  await adminLogin(page);

  await page.goto("/admin/ucty");
  // nobody changes their own role; an administrator may do everything anyway
  await expect(accountSelect(page, E2E.adminEmail, "Role")).toBeDisabled();
  await expect(page.locator("tr", { hasText: E2E.adminEmail })).toContainText("vše");
  // the accounts from before keep everything
  await expect(accountSelect(page, "org@example.com", "Krvavka")).toHaveValue("edit");
  await expect(accountSelect(page, "org@example.com", "Klub")).toHaveValue("edit");

  // the organiser has a session open to edit…
  const ctx = await browser.newContext({ locale: "cs-CZ" });
  const org = await ctx.newPage();
  await adminLogin(org, { email: "org@example.com", password: "organizatorka-heslo" });
  await org.goto(`/admin/botc/termin/${id}`);
  await org.fill("#capacity", "9");

  // …when the administrator leaves them only reading Krvavka and hides the club
  await setAccess(page, "org@example.com", "Krvavka", "view");
  await setAccess(page, "org@example.com", "Klub", "none");
  expect(await sql("select role, botc_access, club_access from admin_users where email = 'org@example.com'")).toEqual([
    { role: "organizer", botc_access: "view", club_access: "none" },
  ]);

  // saving no longer goes through
  await org.click("button:has-text('Uložit změny')");
  await org.waitForURL(/\/admin$/);
  expect(await sql("select capacity from sessions where id = $1", [id])).toEqual([{ capacity: 4 }]);

  // the club is gone from the menu (on the next page load: moving within the admin keeps its layout) and its pages;
  // of the site texts only the Krvavka pages are left
  await org.reload();
  const nav = org.locator("main nav");
  await expect(nav).toContainText("Termíny");
  await expect(nav).not.toContainText("Prezenčka");
  await expect(nav).not.toContainText("Půjčovna");
  for (const path of ["/admin/prezence", "/admin/pujcovna", "/admin/web/klub", "/admin/botc/novy", "/admin/botc/scripty/novy", "/admin/botc/drafty/novy"]) {
    await org.goto(path);
    await expect(org, path).toHaveURL(/\/admin$/);
  }
  expect((await org.request.get("/admin/prezence/export.csv")).status()).toBe(401);
  expect((await org.request.get(`/admin/botc/termin/${id}/export.csv`)).status()).toBe(200);
  await org.goto("/admin/web");
  await expect(org.locator("main")).toContainText("Krvavka – termíny");
  await expect(org.locator("main")).not.toContainText("Úvodní stránka webu");
  await org.goto("/admin/web/krvavka");
  await expect(org.locator("main")).toContainText("si můžeš jen prohlížet");
  await expect(org.locator("main button:has-text('Uložit')")).toHaveCount(0);

  // Krvavka to look at: the session and its players without anything that changes them
  await org.goto("/admin/botc");
  await expect(org.locator("main")).toContainText("si můžeš jen prohlížet");
  await expect(org.locator("main a[href='/admin/botc/novy']")).toHaveCount(0);
  await org.goto(`/admin/botc/termin/${id}`);
  const main = org.locator("main");
  await expect(main).toContainText("hracka@example.com");
  await expect(main).toContainText("Klubovna");
  await expect(main.locator("button:has-text('Uložit změny')")).toHaveCount(0);
  await expect(org.locator("tr", { hasText: "hracka@example.com" }).locator("button")).toHaveCount(0);
  await expect(main.locator("button:has-text('Smazat termín')")).toHaveCount(0);
  // nor the e-mails about sessions
  expect(await recipients(id)).toEqual([E2E.adminEmail]);
  await org.goto("/admin/profil");
  await expect(org.getByTestId("session-emails")).toHaveCount(0);
  // the public pages have no edit pencils for them
  await org.goto("/botc");
  await expect(org.locator("main a[href^='/admin/']")).toHaveCount(0);

  // an administrator now: everything, the accounts too
  await setAccess(page, "org@example.com", "Role", "admin");
  await expect(page.locator("tr", { hasText: "org@example.com" })).toContainText("vše");
  await org.goto("/admin");
  await expect(nav).toContainText("Účty");
  await expect(nav).toContainText("Prezenčka");
  expect(await recipients(id)).toEqual([E2E.adminEmail, "org@example.com"]);
  // and back
  await setAccess(page, "org@example.com", "Role", "organizer");
  await expect(accountSelect(page, "org@example.com", "Krvavka")).toHaveValue("view");
  await ctx.close();

  // in the history
  await page.goto("/admin/historie");
  const entry = page.getByTestId("log-entry").filter({ hasText: "Změna oprávnění" });
  await expect(entry).toHaveCount(4);
  await expect(entry.nth(0)).toContainText("Organizátorka");
  await expect(entry.nth(0)).toContainText("Krvavka: jen čte");
  await expect(entry.nth(0)).toContainText("Klub: nevidí");
  await expect(entry.nth(1)).toContainText("správce");
});

test("accounts: an invitation gives its parts; the club only for the new organiser", async ({ browser, page }) => {
  await adminLogin(page);
  await page.goto("/admin/ucty");
  await page.selectOption("#role", "organizer");
  await page.selectOption("#botc", "none");
  await page.selectOption("#club", "edit");
  await page.fill("#note", "pro prezenčku");
  await page.click("button:has-text('Vytvořit pozvánku')");
  const url = new URL((await page.getByTestId("invite-url").textContent())!).pathname;
  await expect(page.locator("main")).toContainText("organizátor · Krvavka: nevidí · Klub: upravuje");
  // an administrator's invitation has no parts to choose
  await page.selectOption("#role", "admin");
  await expect(page.locator("#botc")).toHaveCount(0);

  const ctx = await browser.newContext({ locale: "cs-CZ" });
  const p2 = await ctx.newPage();
  await p2.goto(url);
  await expect(p2.locator("main")).toContainText("Krvavka: nevidí, Klub: upravuje");
  await p2.fill("#nickname", "Klubová");
  await p2.fill("#email", "klub@example.com");
  await p2.fill("#password", "klubove-tajne-heslo");
  await p2.fill("#passwordAgain", "klubove-tajne-heslo");
  await p2.click("main button[type=submit]");
  await p2.waitForURL(/\/admin$/);
  expect(await sql("select role, botc_access, club_access from admin_users where email = 'klub@example.com'")).toEqual([
    { role: "organizer", botc_access: "none", club_access: "edit" },
  ]);

  // no Krvavka anywhere
  await expect(p2.locator("main nav")).not.toContainText("Termíny");
  await expect(p2.locator("#krvavka")).toHaveCount(0);
  await expect(p2.getByTestId("overview-attendance")).toBeVisible();
  for (const path of ["/admin/botc", "/admin/botc/drafty", "/admin/botc/scripty", "/admin/botc/grimoary", "/admin/botc/statistiky", "/admin/web/krvavka"]) {
    await p2.goto(path);
    await expect(p2, path).toHaveURL(/\/admin$/);
  }
  expect((await p2.request.get("/admin/kalendar.ics")).status()).toBe(401);
  // the club to edit, with the pencil on its page
  await p2.goto("/admin/prezence");
  await expect(p2.locator("main")).toContainText("Přidat ručně");
  await p2.goto("/");
  await expect(p2.locator("main a[href^='/admin/web/klub']")).toBeVisible();
  await p2.goto("/botc");
  await expect(p2.locator("main a[href^='/admin/']")).toHaveCount(0);
  await ctx.close();

  // nobody to invite to a draft who does not see Krvavka
  process.env.DATABASE_URL ??= E2E.databaseUrl;
  const { listInvitableAccounts } = await import("../../src/modules/botc/lib/draft/queries");
  expect((await listInvitableAccounts(0)).map((a) => a.nickname)).toEqual(["Správce"]);
});

test("the club to read: the attendance sheet, the loans and the texts without changing them", async ({ browser, page }) => {
  await createAdminUser({ email: "cte@example.com", password: "jen-cte-heslo", nickname: "Čtenář", role: "organizer", botc: "none", club: "view" });
  await sql("insert into attendance (day, first_name, last_name, affiliation) values (current_date, 'Jana', 'Nováková', 'up')");
  await sql("insert into game_loans (game_id, game_name, borrower, note) values (4282, '6 bere! Jubilejní edice', 'Petr Svoboda', 'chybí karta')");
  const ctx = await browser.newContext({ locale: "cs-CZ" });
  const p = await ctx.newPage();
  await adminLogin(p, { email: "cte@example.com", password: "jen-cte-heslo" });

  const [{ day }] = await sql<{ day: string }>("select to_char(current_date, 'YYYY-MM-DD') as day");
  await p.goto(`/admin/prezence?den=${day}`);
  await expect(p.getByTestId("attendance-entries")).toContainText("Nováková");
  await expect(p.getByTestId("attendance-entries").locator("button")).toHaveCount(0);
  await expect(p.locator("main")).not.toContainText("Přidat ručně");
  expect((await p.request.get(`/admin/prezence/export.csv?od=${day}&do=${day}`)).status()).toBe(200);

  await p.goto("/admin/pujcovna");
  await expect(p.getByTestId("loan-open")).toContainText("6 bere! Jubilejní edice");
  await expect(p.getByTestId("loan-open")).toContainText("Petr Svoboda");
  await expect(p.locator("main button:has-text('Načíst kód z krabice')")).toHaveCount(0);

  await p.goto("/admin/web/klub");
  await expect(p.locator("main")).toContainText("Kdy a kde hrajeme");
  await expect(p.locator("main button:has-text('Uložit')")).toHaveCount(0);
  await p.goto("/");
  await expect(p.locator("main a[href^='/admin/web/klub']")).toHaveCount(0);
  await ctx.close();
  void page;
});
