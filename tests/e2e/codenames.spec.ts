import { expect, test } from "@playwright/test";
import { adminLogin } from "./helpers";

/*
 * Cards of the print tool (mines-generator, generateKeyCards) for the set code "test01", rows of R, B, . and X: the admin
 * must show the very same ones, or a card tried on a phone is not the one that gets printed.
 */
const MINES_RED = [
  "XB..RRB/BRBBBRX/RXRB.R./RRBBR../RB.B.R./RB.R.BR",
  "BB.RRB./.RR.BBR/BBBXBXR/R..BR.B/...RB.R/RRRBRRX",
];
const MIRRORS_RANDOM = [
  "BB.X.BB/.RBBBR./RBR.RBR/R.BBB.R/B.RRR.B/..BRB../RRB.BRR",
  ".BRBB.B/.BRRX../BR....B/BBRR.RB/BR.R.RR/RBRBRBB/RRBBB..",
];

test("admin: Codenames key cards are the print tool's, full screen shows only the card", async ({ page }) => {
  await adminLogin(page);
  await page.click("[data-testid=overview-codenames]");
  await expect(page).toHaveURL(/\/admin\/kryci-jmena$/);
  await expect(page.locator("[data-admin-nav]")).toContainText("Krycí jména");

  // Big Mines, red starts
  await page.getByText("Červení", { exact: true }).click();
  await page.fill("input[name=code]", "test01");
  const card = page.locator("main [data-board]").first();
  await expect(card).toHaveAttribute("data-board", MINES_RED[0]);
  await expect(card).toHaveAttribute("data-seed", "test01/1");
  await expect(card.locator("svg")).toContainText("Big Mines · 1");
  await expect(card.locator("svg")).toContainText("Začínají červení");
  // under the grid how many of each there are: red, blue, white (civilians), assassins
  for (const count of ["Č: 15", "M: 13", "B: 11", "💀: 3"]) await expect(card.locator("svg")).toContainText(count);
  // mine numbers on every cell but the three assassins', which end the game anyway – unless asked for
  await expect(card.locator("svg text:has(tspan)")).toHaveCount(42 - 3);
  await page.getByLabel("I u vrahů").check();
  await expect(card.locator("svg text:has(tspan)")).toHaveCount(42);
  await page.getByLabel("I u vrahů").uncheck();
  // they can be turned off; the axes are no option here (Big Mines has none)
  await page.locator("input[name=showMines]").uncheck();
  await expect(card.locator("svg text:has(tspan)")).toHaveCount(0);
  await expect(page.locator("input[name=showAxes]")).toHaveCount(0);
  await page.getByRole("button", { name: "Další kartička" }).click();
  await expect(card).toHaveAttribute("data-board", MINES_RED[1]);
  await expect(page.getByTestId("codenames-card-number")).toHaveText("Kartička 2");

  // another mode or team starts the set again
  await page.locator("label").filter({ hasText: "Ultimate Mirrors" }).click();
  await page.getByText("Náhodně", { exact: true }).click();
  await expect(card).toHaveAttribute("data-board", MIRRORS_RANDOM[0]);
  await expect(card).toHaveAttribute("data-starts", "BLUE");
  // no mine numbers in this mode, not even as an option; the axes are always on the card, with no option either
  await expect(page.locator("input[name=showMines]")).toHaveCount(0);
  await expect(page.locator("input[name=showAxes]")).toHaveCount(0);
  await expect(card.locator("svg text:has(tspan)")).toHaveCount(0);
  // both teams' axis is vertical: two icons in the header, across the cells a white line under a red and a blue dashed one
  await expect(card.locator("svg line")).toHaveCount(2 + 3);

  // full screen: only the card, the arrow keys step through the set, Esc closes it
  await page.getByRole("button", { name: "Na celou obrazovku" }).click();
  const full = page.getByTestId("codenames-fullscreen");
  await expect(full.locator("[data-board]")).toHaveAttribute("data-board", MIRRORS_RANDOM[0]);
  const box = await full.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  await page.keyboard.press("ArrowRight");
  await expect(full.locator("[data-board]")).toHaveAttribute("data-board", MIRRORS_RANDOM[1]);
  await page.keyboard.press("Escape");
  await expect(full).toBeHidden();

  // a reload (a phone that slept) shows the same card
  await page.reload();
  await expect(card).toHaveAttribute("data-seed", "test01/2");
  await expect(card).toHaveAttribute("data-board", MIRRORS_RANDOM[1]);

  // in English the card's texts too, the counts with R, B, W
  await page.context().addCookies([{ name: "botc_lang", value: "en", url: new URL(page.url()).origin }]);
  await page.reload();
  await expect(card).toHaveAttribute("data-board", MIRRORS_RANDOM[1]);
  await expect(card).toHaveAttribute("data-starts", "BLUE");
  for (const text of ["Blue starts", "R: 16", "B: 18", "W: 14", "💀: 1"]) await expect(card.locator("svg")).toContainText(text);

  // back in Big Mines the mine numbers are on again, though they were turned off there
  await page.locator("label").filter({ hasText: "Big Mines" }).click();
  await expect(page.locator("input[name=showMines]")).toBeChecked();
  await expect(card.locator("svg text:has(tspan)")).toHaveCount(42 - 3);
});

test("admin: Codenames print – the set on A4 pages, the cards of the phone, alone in print; how the modes are played", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/kryci-jmena");
  await page.getByText("Červení", { exact: true }).click();
  await page.fill("input[name=code]", "test01");
  const print = page.getByTestId("codenames-print");
  const status = page.getByTestId("codenames-print-status");
  // 12 cards, 6 to a page by default
  await expect(status).toHaveText("12 kartiček · 2 strany A4");
  await print.locator("input[name=count]").fill("5");
  await print.locator("select[name=perPage]").selectOption("4");
  await expect(status).toHaveText("5 kartiček · 2 strany A4");

  // the set the phone shows: cards 1–4 on the first page, card 5 on the second, each with its title and code
  const pages = page.locator("[data-codenames-pages] > div");
  await expect(pages).toHaveCount(2);
  for (const n of [1, 2, 3, 4]) {
    await expect(pages.nth(0)).toContainText(`Big Mines · ${n}`);
    await expect(pages.nth(0)).toContainText(`test01/${n}`);
  }
  await expect(pages.nth(1)).toContainText("test01/5");
  await print.getByLabel("Kód kartičky (pro dotisk)").uncheck();
  await expect(pages.nth(1)).not.toContainText("test01/5");

  // not on screen; in print the pages are all there is
  await expect(page.locator("[data-codenames-pages]")).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-codenames-pages]")).toBeVisible();
  await expect(page.locator("main")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator("main")).toBeVisible();

  // the preview shows the same pages
  await print.locator("summary").click();
  await expect(print.locator("figure")).toHaveCount(2);

  // under the tool: how the game and both modes are played
  const rules = page.getByTestId("codenames-rules");
  for (const title of ["Jak se to hraje", "Krycí jména v kostce", "Big Mines", "Ultimate Mirrors"]) await expect(rules).toContainText(title);
});
