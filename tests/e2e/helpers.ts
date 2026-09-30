import { type Page, expect } from "@playwright/test";
import { Client } from "pg";
import { E2E } from "../../playwright.config";
import { hashPassword } from "../../src/lib/password";

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
  await sql("delete from registrations");
  await sql("delete from sessions");
  await sql("delete from admin_invites");
  await sql("delete from admin_users");
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
  }> = {},
) {
  const daysAhead = overrides.daysAhead ?? 7;
  const start = new Date(Date.now() + daysAhead * 864e5);
  start.setUTCHours(17, 0, 0, 0);
  const end = new Date(start.getTime() + 4 * 36e5);
  const rows = await sql<{ id: number }>(
    "insert into sessions (title, starts_at, ends_at, place, capacity, note, scripts, arrival_mode, phone_required) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
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
  await page.goto(`/termin/${sessionId}`);
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
