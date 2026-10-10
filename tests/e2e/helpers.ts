import { type Page, expect } from "@playwright/test";
import { Client } from "pg";
import { E2E } from "../../playwright.config";
import { hashPassword } from "../../src/lib/password";
import { pragueLocalToDate } from "../../src/lib/time";

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client(E2E.databaseUrl);
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

export async function resetDb() {
  // sessions, members, picks, pools, scripts and events go with their draft
  await sql("delete from drafts");
  await sql("delete from grimoires");
  await sql("delete from registrations");
  await sql("delete from sessions");
  await sql("delete from admin_invites");
  await sql("delete from password_resets");
  await sql("delete from qr_logins");
  await sql("delete from admin_log");
  await sql("delete from session_email_prefs");
  await sql("delete from admin_users");
  await sql("delete from login_failures");
  await sql("delete from link_requests");
  await sql("delete from job_runs");
  await sql("delete from site_texts");
  await sql("delete from scripts");
  await sql("delete from attendance");
  await sql("delete from game_loans");
  await sql("delete from game_barcodes");
}

/** Inserts an organiser account straight into the database (no invitation needed). */
export async function createAdminUser(
  overrides: Partial<{ email: string; password: string; nickname: string; role: "admin" | "organizer" }> = {},
) {
  const rows = await sql<{ id: number }>(
    "insert into admin_users (nickname, email, password_hash, role) values ($1,$2,$3,$4) returning id",
    [
      overrides.nickname ?? "Správce",
      overrides.email ?? E2E.adminEmail,
      await hashPassword(overrides.password ?? E2E.adminUserPassword),
      overrides.role ?? "admin",
    ],
  );
  return rows[0].id;
}

export async function createSession(
  overrides: Partial<{
    title: string;
    capacity: number;
    daysAhead: number;
    arrivalMode: "times" | "late";
    phoneRequired: boolean;
    gameLanguage: "cs" | "en" | "both";
    /** exact start instead of 19:00 Prague time `daysAhead` days from now */
    startsAt: Date;
  }> = {},
) {
  const daysAhead = overrides.daysAhead ?? 7;
  // 19:00–23:00 Prague time, in summer and in winter alike
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date(Date.now() + daysAhead * 864e5));
  const start = overrides.startsAt ?? pragueLocalToDate(`${day}T19:00`)!;
  const end = new Date(start.getTime() + 4 * 36e5);
  const rows = await sql<{ id: number }>(
    "insert into sessions (title, starts_at, ends_at, place, capacity, note, scripts, arrival_mode, phone_required, game_language) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
    [
      overrides.title ?? "Herní večer",
      start.toISOString(),
      end.toISOString(),
      "Klubovna",
      overrides.capacity ?? 2,
      null,
      JSON.stringify([]),
      overrides.arrivalMode ?? "times",
      overrides.phoneRequired ?? false,
      overrides.gameLanguage ?? "cs",
    ],
  );
  return rows[0].id;
}

/** Logs in as the default administrator, creating the account first when it does not exist yet. */
export async function adminLogin(page: Page, creds: { email: string; password: string } = { email: E2E.adminEmail, password: E2E.adminUserPassword }) {
  if (creds.email === E2E.adminEmail) {
    const existing = await sql("select id from admin_users where email=$1", [creds.email]);
    if (existing.length === 0) await createAdminUser();
  }
  await page.goto("/admin/login");
  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);
  await page.click("main button[type=submit]");
  await page.waitForURL(/\/admin$/);
}

export async function register(
  page: Page,
  sessionId: number,
  data: { first?: string; last?: string; nick: string; email: string; phone?: string; arrival?: string; note?: string },
) {
  await page.goto(`/botc/termin/${sessionId}`);
  await page.fill("#firstName", data.first ?? "Test");
  await page.fill("#lastName", data.last ?? "Testovic");
  await page.fill("#nickname", data.nick);
  await page.fill("#email", data.email);
  await page.fill("#phone", data.phone ?? "+420 777 123 456");
  if (data.arrival) await page.selectOption("#arrivalTime", data.arrival);
  if (data.note) await page.fill("#note", data.note);
  await page.click("main form button[type=submit]");
  await expect(page.getByTestId("register-result")).toBeVisible({ timeout: 15000 });
  return page.locator("main").textContent().then((t) => t ?? "");
}

/** Today's date in Prague as "YYYY-MM-DD", like the admin date pickers use */
export function pragueToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
}
