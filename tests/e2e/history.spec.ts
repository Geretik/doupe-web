import { expect, test } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { adminLogin, createAdminUser, createSession, register, resetDb, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
});

test("history: the admin's actions are logged; administrators see and filter them, organisers do not", async ({ page }) => {
  const id = await createSession({ title: "Večer s historií", capacity: 1 });
  await register(page, id, { nick: "Hráčka", email: "hracka@example.com" });
  await adminLogin(page);

  await page.goto(`/admin/botc/termin/${id}`);
  await page.fill("#capacity", "3");
  await page.click("button:has-text('Uložit změny')");
  await expect(page.locator("main")).toContainText("Uloženo");
  await page.click("tr:has-text('hracka@example.com') button[title='Dorazil/a']");
  await expect(page.locator("tr:has-text('hracka@example.com') button[title='Dorazil/a']")).toHaveAttribute("aria-pressed", "true");

  // only what changed is logged; the player only by their registration, never by name or e-mail
  const logged = await sql<{ action: string; data: Record<string, unknown> }>("select action, data from admin_log order by id");
  expect(logged.map((r) => r.action)).toEqual(["account.login", "session.update", "session.attendance"]);
  expect(logged[1].data.changes).toEqual([{ field: "capacity", from: 1, to: 3 }]);
  expect(JSON.stringify(logged)).not.toContain("hracka@example.com");
  expect(JSON.stringify(logged)).not.toContain("Hráčka");

  // the session's own history
  await page.click("a:has-text('Historie změn')");
  await expect(page).toHaveURL(new RegExp(`/admin/historie\\?termin=${id}$`));
  const rows = page.getByTestId("log-entry");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Docházka");
  await expect(rows.nth(0)).toContainText("Hráčka");
  await expect(rows.nth(0)).toContainText("přišel/a");
  await expect(rows.nth(1)).toContainText("Úprava termínu");
  await expect(rows.nth(1)).toContainText("kapacita 1 → 3");
  await expect(rows.nth(1).locator(`a[href='/admin/botc/termin/${id}']`)).toHaveText(/Večer s historií/);

  // everything, then one area
  await page.click("a:has-text('Zobrazit vše')");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText("Přihlášení");
  await expect(rows.nth(2)).toContainText("heslem");
  await page.selectOption("select[name=oblast]", "account");
  await page.click("button:has-text('Zobrazit')");
  await expect(page).toHaveURL(/oblast=account/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Přihlášení");

  // a deleted session keeps its name in the history, without a link
  await sql("delete from sessions where id = $1", [id]);
  await page.goto("/admin/historie?oblast=session");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("Večer s historií");
  await expect(page.locator(`main a[href='/admin/botc/termin/${id}']`)).toHaveCount(0);

  // organisers have no history
  await createAdminUser({ email: "org@example.com", nickname: "Org", role: "organizer" });
  await page.context().clearCookies();
  await adminLogin(page, { email: "org@example.com", password: E2E.adminUserPassword });
  await expect(page.locator("nav[data-admin-nav]")).not.toContainText("Historie");
  await page.goto("/admin/historie");
  await expect(page).toHaveURL(/\/admin$/);
});
