import { expect, test } from "@playwright/test";
import { E2E } from "../../playwright.config";
import { adminLogin, createAdminUser, createSession, resetDb, sql } from "./helpers";

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

test("e-mails about sessions: on for new accounts, turned off in the profile, chosen again at one session", async ({ page }) => {
  const soon = await createSession({ title: "Brzký večer", capacity: 5, startsAt: new Date(Date.now() + 6 * 36e5) });
  const later = await createSession({ title: "Pozdější večer", capacity: 5, daysAhead: 7 });
  const orgId = await createAdminUser({ email: "org@example.com", nickname: "Org", role: "organizer" });
  await adminLogin(page);
  expect(await sql("select email, session_emails from admin_users order by email")).toEqual([
    { email: "admin@example.com", session_emails: true },
    { email: "org@example.com", session_emails: true },
  ]);
  expect(await recipients(soon)).toEqual(["admin@example.com", "org@example.com"]);

  // not for every session any more
  await page.goto("/admin/profil");
  const box = page.getByTestId("session-emails");
  await expect(box).toContainText("Teď je dostáváš ke každému termínu");
  await box.locator("button:has-text('Nedostávat')").click();
  await expect(box).toContainText("Teď je nedostáváš");
  await expect(box.locator("button:has-text('Dostávat')")).toBeVisible();
  expect(await sql("select session_emails from admin_users where email = 'admin@example.com'")).toEqual([{ session_emails: false }]);

  // …but for this one, yes
  await page.goto(`/admin/botc/termin/${soon}`);
  await page.click("button:has-text('Chci e-maily k termínu')");
  await expect(page.locator("main")).toContainText("E-maily k termínu ti budou chodit.");
  await expect(page.locator("button:has-text('Nechci e-maily k termínu')")).toBeVisible();
  // the other organiser keeps them in general, but not for this session
  await sql("insert into session_email_prefs (session_id, user_id, enabled) values ($1, $2, false)", [soon, orgId]);

  expect(await recipients(soon)).toEqual(["admin@example.com"]);
  expect(await recipients(later)).toEqual(["org@example.com"]);
  await page.goto(`/admin/botc/termin/${later}`);
  await expect(page.locator("button:has-text('Chci e-maily k termínu')")).toBeVisible();

  // in the history
  await page.goto("/admin/historie");
  await expect(page.getByTestId("log-entry").nth(0)).toContainText("E-maily k termínu");
  await expect(page.getByTestId("log-entry").nth(0)).toContainText("zapnuté");
  await expect(page.getByTestId("log-entry").nth(1)).toContainText("E-maily k termínům");
  await expect(page.getByTestId("log-entry").nth(1)).toContainText("vypnuté");
});
