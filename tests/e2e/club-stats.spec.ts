import { expect, test } from "@playwright/test";
import { adminLogin, createAdminUser, resetDb, sql } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

const PERIOD = "/admin/statistiky-klubu?od=2025-10-01&do=2025-11-30";

test("club statistics: the attendance sheet and the loans of a period", async ({ page }) => {
  await adminLogin(page);
  // Tuesday 7. 10., Thursday 9. 10. and Tuesday 14. 10. 2025; Eva came once before, in September
  await sql(
    `insert into attendance (day, first_name, last_name, affiliation, created_at, added_by) values
      ('2025-09-02', 'Eva', 'Černá', 'up', '2025-09-02 18:00+02', null),
      ('2025-10-07', 'Jana', 'Nováková', 'up', '2025-10-07 18:10+02', null),
      ('2025-10-07', 'Petr', 'Svoboda', 'none', '2025-10-07 18:40+02', null),
      ('2025-10-09', 'Jana', 'Nováková', 'up', '2025-10-09 19:05+02', null),
      ('2025-10-09', 'Ota', 'Malý', 'none', '2025-10-12 10:00+02', (select min(id) from admin_users)),
      ('2025-10-14', 'Jana', 'nováková', 'up', '2025-10-14 18:20+02', null),
      ('2025-10-14', 'Petr', 'Svoboda', 'none', '2025-10-15 00:30+02', null),
      ('2025-10-14', 'Eva', 'Černá', 'up', '2025-10-14 18:15+02', null)`,
  );
  await sql(
    `insert into game_loans (game_id, game_name, borrower, lent_at, returned_at) values
      (13611, 'Akropolis', 'Jana Nováková', '2025-10-07 18:30+02', '2025-10-14 19:00+02'),
      (4019, '1775: Rebellion', 'Petr Svoboda', '2025-10-09 20:00+02', null),
      (13611, 'Akropolis', 'Eva Černá', '2025-10-14 20:00+02', '2025-10-17 18:00+02'),
      (12398, 'Archa Nova', 'Jana Nováková', '2025-11-03 19:00+02', '2025-11-05 19:00+01')`,
  );

  // from the menu, then the period
  await page.getByRole("navigation").getByRole("link", { name: "Statistiky" }).last().click();
  await expect(page.locator("h1")).toHaveText("Statistiky klubu");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Statistiky" }).last()).toHaveAttribute("aria-current", "page");
  await page.goto(PERIOD);

  // 3 nights, 7 entries, 4 people (Jana's name once in small letters), Eva not new
  const tiles = page.getByTestId("club-stats-attendance");
  await expect(tiles).toContainText("Večerů3");
  await expect(tiles).toContainText("Zápisů7");
  await expect(tiles).toContainText("Různých lidí4");
  await expect(tiles).toContainText("Průměr na večer2,3");
  await expect(tiles).toContainText("Nejvíc za večer3út 14. 10.");
  await expect(tiles).toContainText("Poprvé v klubu3");
  await expect(page.getByTestId("club-stats-nights-chart").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByTestId("club-stats-nights-chart").locator('[aria-label="út 14. 10.: 3 lidé"]')).toHaveCount(1);
  await expect(page.getByTestId("club-stats-weekdays")).toHaveText(/Úterý\s*2,5\s*\(2 večery\)\s*Čtvrtek\s*2\s*\(1 večer\)/);
  await expect(page.getByTestId("club-stats-how-often")).toHaveText(/1×\s*2\s*2–3×\s*2\s*4–9×\s*0\s*10× a víc\s*0/);
  // arrivals by half an hour from 18:00 to the one after midnight; Ota, added by hand, is left out
  const arrivals = page.getByTestId("club-stats-arrivals").getByRole("listitem");
  await expect(arrivals).toHaveCount(14);
  await expect(arrivals.first()).toHaveAttribute("aria-label", "18:00–18:30: 3 lidé");
  await expect(arrivals.last()).toHaveAttribute("aria-label", "0:30–1:00: 1 člověk");
  await expect(page.getByTestId("attendance-summary").locator("tr:has-text('Celkem')")).toHaveText(/Celkem\s*7\s*4/);

  // 4 loans of 3 games, back after 7, 3 and 2 days; Rebellion is still out
  const loans = page.getByTestId("club-stats-loans");
  await expect(loans).toContainText("Výpůjček4");
  await expect(loans).toContainText("Různých her3");
  await expect(loans).toContainText("Průměrně venku4 dny");
  await expect(loans).toContainText("Půjčeno teď1");
  await expect(loans).toContainText("nejdéle 1775: Rebellion");
  await expect(page.getByTestId("club-stats-top-games").getByRole("listitem")).toHaveText([/^Akropolis\s*2$/, /^1775: Rebellion\s*1$/, /^Archa Nova\s*1$/]);
  await expect(page.getByTestId("club-stats-months").getByRole("listitem")).toHaveCount(2);
  await expect(page.getByTestId("club-stats-months").getByRole("listitem").first()).toHaveAttribute("aria-label", "říjen 2025: 3 výpůjčky");

  // a period with nothing in it
  await page.goto("/admin/statistiky-klubu?od=2024-01-01&do=2024-01-31");
  await expect(page.getByTestId("club-stats-attendance")).toContainText("Večerů0");
  await expect(page.locator("main")).toContainText("V tomto období se na prezenčku nikdo nezapsal.");
  await expect(page.locator("main")).toContainText("V tomto období se nic nepůjčilo.");
});

test("club statistics: not for one who doesn't see the club", async ({ page }) => {
  await createAdminUser({ email: "krvavka@example.com", password: "krvavka-heslo-123", role: "organizer", club: "none" });
  await adminLogin(page, { email: "krvavka@example.com", password: "krvavka-heslo-123" });
  await expect(page.locator("[data-admin-nav]").getByRole("link", { name: "Statistiky" })).toHaveCount(1);
  await page.goto("/admin/statistiky-klubu");
  await expect(page).toHaveURL(/\/admin$/);
});
