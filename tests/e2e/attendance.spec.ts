import { expect, test } from "@playwright/test";
import { adminLogin, resetDb, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
});

type Row = { day: string; first_name: string | null; last_name: string | null; affiliation: string; device_key_hash: string | null; added_by: number | null };
const rows = () => sql<Row>("select day::text, first_name, last_name, affiliation, device_key_hash, added_by from attendance order by id");

async function fillPerson(page: import("@playwright/test").Page, first: string, last: string, affiliation: string) {
  await page.fill("#firstName", first);
  await page.fill("#lastName", last);
  await page.getByLabel(affiliation).check();
}

test("attendance: a phone remembers the person, the next night is one tap; corrections, someone else, not me", async ({ page, context }) => {
  await page.goto("/prezence");
  await expect(page.locator("h1")).toHaveText("Prezenčka");
  await expect(page.locator("main")).toContainText("Klubový večer");
  await fillPerson(page, "Jana", "Nováková", "Student/ka UP");
  await expect(page.getByLabel("Zapamatovat si mě na tomto telefonu")).toBeChecked();
  await page.click("button:has-text('Zapsat se')");
  await expect(page.locator("main")).toContainText("Zapsáno: Jana Nováková. Vítej v klubu!");
  await expect(page.getByTestId("attendance-recorded")).toContainText("Na dnešní prezenčce jsi od");
  let saved = await rows();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ first_name: "Jana", last_name: "Nováková", affiliation: "student", added_by: null });
  expect(saved[0].device_key_hash).toMatch(/^[0-9a-f]{64}$/);
  const night = saved[0].day;

  // the cookie is only for this page and not readable by scripts
  const cookie = (await context.cookies()).find((c) => c.name === "prezence");
  expect(cookie).toMatchObject({ path: "/prezence", httpOnly: true });

  // scanning again the same night: already there
  await page.reload();
  await expect(page.getByTestId("attendance-recorded")).toBeVisible();
  await expect(page.getByTestId("attendance-checkin")).toHaveCount(0);

  // a correction changes tonight's entry too
  await page.click("button:has-text('Opravit údaje')");
  await expect(page.locator("#firstName")).toHaveValue("Jana");
  await page.getByLabel("Absolvent/ka UP").check();
  await page.click("button:has-text('Uložit')");
  await expect(page.locator("main")).toContainText("Opraveno.");
  await expect(page.locator("main")).toContainText("Absolvent/ka UP");
  saved = await rows();
  expect(saved).toHaveLength(1);
  expect(saved[0].affiliation).toBe("graduate");

  // a friend without a phone: on the sheet, but this phone keeps remembering Jana
  await page.click("button:has-text('Zapsat někoho dalšího')");
  await fillPerson(page, "Petr", "Svoboda", "Externista – bez vztahu k UP");
  await expect(page.getByLabel("Zapamatovat si mě na tomto telefonu")).toHaveCount(0);
  await page.click("button:has-text('Zapsat')");
  await expect(page.locator("main")).toContainText("Zapsáno: Petr Svoboda.");
  await expect(page.locator("main")).toContainText("Jana Nováková");
  saved = await rows();
  expect(saved.map((r) => [r.first_name, r.affiliation, r.device_key_hash === null])).toEqual([
    ["Jana", "graduate", false],
    ["Petr", "external", true],
  ]);
  // nobody twice on one night, whatever the case of the name
  await page.click("button:has-text('Zapsat někoho dalšího')");
  await fillPerson(page, "petr", "SVOBODA", "Externista – bez vztahu k UP");
  await page.click("button:has-text('Zapsat')");
  await expect(page.locator("main")).toContainText("Petr Svoboda už na dnešní prezenčce je");
  expect(await rows()).toHaveLength(2);

  // the next club night: one tap
  await sql("update attendance set day = day - 7");
  await page.reload();
  await expect(page.getByTestId("attendance-checkin")).toBeVisible();
  await page.getByTestId("attendance-checkin").click();
  await expect(page.locator("main")).toContainText("Zapsáno: Jana Nováková. Vítej v klubu!");
  await expect(page.getByTestId("attendance-recorded")).toBeVisible();
  saved = await rows();
  expect(saved).toHaveLength(3);
  expect(saved[2]).toMatchObject({ day: night, first_name: "Jana", affiliation: "graduate" });

  // "That's not me": the phone forgets her, her entries stay
  await page.click("button:has-text('To nejsem já')");
  await expect(page.getByTestId("attendance-form-new")).toBeVisible();
  await expect.poll(async () => (await context.cookies()).some((c) => c.name === "prezence")).toBe(false);
  await page.reload();
  await expect(page.getByTestId("attendance-form-new")).toBeVisible();
  expect(await rows()).toHaveLength(3);
});

test("attendance: without remembering, the form is ready for the next person; the site does not link to it", async ({ page, context }) => {
  await page.goto("/prezence");
  await fillPerson(page, "Karel", "Dvořák", "Zaměstnanec/kyně UP");
  await page.getByLabel("Zapamatovat si mě na tomto telefonu").uncheck();
  await page.click("button:has-text('Zapsat se')");
  await expect(page.locator("main")).toContainText("Zapsáno: Karel Dvořák.");
  expect((await context.cookies()).some((c) => c.name === "prezence")).toBe(false);
  await page.click("button:has-text('Zapsat někoho dalšího')");
  await expect(page.locator("#firstName")).toHaveValue("");
  expect(await rows()).toMatchObject([{ first_name: "Karel", affiliation: "employee", device_key_hash: null }]);

  // only the QR code and the admin lead here
  await page.goto("/");
  await expect(page.locator("a[href='/prezence']")).toHaveCount(0);
  const robots = await (await page.request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /prezence");
});

test("attendance admin: tonight's list, adding and deleting by hand, numbers of a period and the CSV", async ({ page }) => {
  await page.goto("/prezence");
  await fillPerson(page, "Jana", "Nováková", "Student/ka UP");
  await page.click("button:has-text('Zapsat se')");
  await expect(page.getByTestId("attendance-recorded")).toBeVisible();
  const [{ day }] = await rows();
  await sql("insert into attendance (day, first_name, last_name, affiliation) values ($1::date - 2, 'Jana', 'Nováková', 'student'), ($1::date - 2, 'Ota', 'Malý', 'external')", [day]);

  await adminLogin(page);
  await expect(page.getByTestId("overview-attendance")).toContainText("dnes 1 člověk");
  await page.click("[data-admin-nav] a:has-text('Prezenčka')");
  await expect(page).toHaveURL(/\/admin\/prezence$/);
  await expect(page.getByTestId("attendance-link")).toHaveText(/\/prezence$/);
  await expect(page.getByTestId("attendance-night")).toContainText("dnes · 1 člověk");
  await expect(page.getByTestId("attendance-entries")).toContainText("Nováková");

  // someone without a phone
  await page.click("summary:has-text('Přidat ručně')");
  const add = page.getByTestId("attendance-add");
  await add.locator("#add-firstName").fill("Eva");
  await add.locator("#add-lastName").fill("Černá");
  await add.getByLabel("Zaměstnanec/kyně UP").check();
  await add.locator("button[type=submit]").click();
  await expect(add).toContainText("Eva Černá je na prezenčce.");
  await expect(page.getByTestId("attendance-entries")).toContainText("Černá");
  await expect(page.getByTestId("attendance-entries")).toContainText("přidal/a Správce");
  await add.locator("#add-firstName").fill("Jana");
  await add.locator("#add-lastName").fill("Nováková");
  await add.getByLabel("Student/ka UP").check();
  await add.locator("button[type=submit]").click();
  await expect(add).toContainText("Jana Nováková už na prezenčce toho večera je");

  // the period (from far back: two days ago may be before this academic year): 2 nights, 4 entries, 3 different people (Jana twice)
  await page.goto("/admin/prezence?od=2000-01-01");
  const summary = page.getByTestId("attendance-summary");
  await expect(summary).toContainText("2 večery");
  await expect(summary.locator("tr:has-text('Celkem')")).toHaveText(/Celkem\s*4\s*3/);
  await expect(summary.locator("tr:has-text('Student/ka UP')")).toHaveText(/Student\/ka UP\s*2\s*1/);
  await expect(page.getByTestId("attendance-nights").locator("tbody tr")).toHaveCount(2);

  const csvHref = await page.getByTestId("attendance-csv").getAttribute("href");
  const csv = await (await page.request.get(csvHref!)).text();
  expect(csv.split("\r\n")[0]).toBe("﻿Datum;Čas;Jméno;Příjmení;Vztah k UP;Zapsáno");
  expect(csv).toContain(";Eva;Černá;Zaměstnanec/kyně UP;ručně (Správce)");
  expect(csv).toContain(";Ota;Malý;Externista – bez vztahu k UP;sám/sama");

  // deleting; the log has the night and the affiliation, never the name
  page.once("dialog", (d) => d.accept());
  await page.click("button[aria-label='Smazat: Eva Černá']");
  await expect(page.getByTestId("attendance-entries")).not.toContainText("Černá");
  expect((await rows()).map((r) => r.first_name)).not.toContain("Eva");
  const logged = await sql<{ action: string; data: Record<string, unknown> }>("select action, data from admin_log where action like 'attendance.%' order by id");
  expect(logged).toEqual([
    { action: "attendance.add", data: { day, affiliation: "employee" } },
    { action: "attendance.delete", data: { day, affiliation: "employee" } },
  ]);

  // an older night through the list of nights
  await page.getByTestId("attendance-nights").locator("tbody tr").nth(1).locator("a").click();
  await expect(page.getByTestId("attendance-entries")).toContainText("Malý");

  // the card for the table
  await page.goto("/admin/prezence/tisk");
  await expect(page.locator("article")).toContainText("Načti QR kód telefonem a zapiš se");
  const qr = await page.request.get("/prezence/qr.svg");
  expect(qr.headers()["content-type"]).toContain("image/svg+xml");
});

test("attendance: names are deleted after the retention period, the counts stay", async ({ request }) => {
  await sql("insert into attendance (day, first_name, last_name, affiliation, device_key_hash) values (current_date - 800, 'Stará', 'Návštěva', 'student', 'x'), (current_date - 10, 'Nová', 'Návštěva', 'student', null)");
  const res = await request.get("/api/cron/reminders", { headers: { authorization: "Bearer e2e-cron" } });
  expect(res.ok()).toBe(true);
  expect((await res.json()).attendance).toEqual({ anonymized: 1 });
  expect((await rows()).map((r) => [r.first_name, r.affiliation, r.device_key_hash])).toEqual([
    [null, "student", null],
    ["Nová", "student", null],
  ]);
});
