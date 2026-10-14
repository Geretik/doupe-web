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
  // mine numbers on every cell but the three assassins', which end the game anyway – unless asked for
  await expect(card.locator("svg text:has(tspan)")).toHaveCount(42 - 3);
  await page.getByLabel("I u vrahů").check();
  await expect(card.locator("svg text:has(tspan)")).toHaveCount(42);
  await page.getByLabel("I u vrahů").uncheck();
  await page.getByRole("button", { name: "Další kartička" }).click();
  await expect(card).toHaveAttribute("data-board", MINES_RED[1]);
  await expect(page.getByTestId("codenames-card-number")).toHaveText("Kartička 2");

  // another mode or team starts the set again
  await page.getByText("Ultimate Mirrors", { exact: true }).click();
  await page.getByText("Náhodně", { exact: true }).click();
  await expect(card).toHaveAttribute("data-board", MIRRORS_RANDOM[0]);
  await expect(card).toHaveAttribute("data-starts", "BLUE");
  await expect(page.locator("input[name=showMines]")).not.toBeChecked();
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
});
