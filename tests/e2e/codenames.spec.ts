import { expect, test, type Page } from "@playwright/test";
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

/** The board in full screen as rows like the ones above, from the cells' labels */
async function screenRows(page: Page) {
  const sign: Record<string, string> = { "Červený agent": "R", "Modrý agent": "B", Civilista: ".", Vrah: "X" };
  const board = page.getByTestId("codenames-board");
  const width = (await board.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)) as number;
  const labels = await board.locator("[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!));
  const rows: string[] = [];
  for (let i = 0; i < labels.length; i += width) rows.push(labels.slice(i, i + width).map((l) => sign[l]).join(""));
  return rows.join("/");
}

test("admin: Codenames key cards are the print tool's, shown only in full screen over the whole display", async ({ page }) => {
  await adminLogin(page);
  await page.click("[data-testid=overview-codenames]");
  await expect(page).toHaveURL(/\/admin\/kryci-jmena$/);
  await expect(page.locator("[data-admin-nav]")).toContainText("Krycí jména");

  // Big Mines, red starts
  await page.getByText("Červení", { exact: true }).click();
  await page.fill("input[name=code]", "test01");
  const card = page.getByTestId("codenames-card");
  await expect(card).toHaveAttribute("data-board", MINES_RED[0]);
  await expect(card).toHaveAttribute("data-seed", "test01/1");
  // on the page the card is hidden
  await expect(card).toContainText("ukáže se až na celé obrazovce");
  await expect(page.locator("main [data-cell]")).toHaveCount(0);

  // full screen: the board over the display but for the strip at the side, with who starts and the counts there
  const full = page.getByTestId("codenames-fullscreen");
  const board = page.getByTestId("codenames-board");
  const open = () => page.getByRole("button", { name: "Na celou obrazovku" }).click();
  await open();
  await expect(full).toContainText("Big Mines · 1");
  await expect(full).toContainText("Začínají červení");
  expect(await screenRows(page)).toBe(MINES_RED[0]);
  const viewport = page.viewportSize()!;
  const area = (await board.boundingBox())!;
  expect(area.height).toBeGreaterThan(viewport.height - 20);
  expect(area.width).toBeGreaterThan(viewport.width - 150);
  const count = (type: string) => full.locator(`[data-count=${type}]`);
  for (const [type, n] of [["RED_AGENT", 15], ["BLUE_AGENT", 13], ["CIVILIAN", 11], ["ASSASSIN", 3]] as const) await expect(count(type)).toHaveText(new RegExp(`:${n}$`));
  // mine numbers on every cell but the three assassins', which end the game anyway
  await expect(board.locator("[data-mines]")).toHaveCount(42 - 3);
  // a tap darkens a cell as guessed (its colour is left one fewer), another brings it back
  const blue = board.locator("[data-cell='1']");
  await blue.click();
  await expect(blue).toHaveAttribute("aria-pressed", "true");
  await expect(count("BLUE_AGENT")).toHaveText(/:12\/13$/);
  await blue.click();
  await expect(blue).toHaveAttribute("aria-pressed", "false");
  await expect(count("BLUE_AGENT")).toHaveText(/:13$/);
  await blue.click();
  await full.getByRole("button", { name: "Zavřít" }).click();
  await expect(full).toBeHidden();

  // the mine numbers on the assassins too – when asked for
  await page.getByLabel("I u vrahů").check();
  await open();
  await expect(board.locator("[data-mines]")).toHaveCount(42);
  await page.keyboard.press("Escape");
  await page.getByLabel("I u vrahů").uncheck();
  // they can be turned off; the axes are no option here (Big Mines has none)
  await page.locator("input[name=showMines]").uncheck();
  await expect(page.locator("input[name=showAxes]")).toHaveCount(0);
  await open();
  await expect(board.locator("[data-mines]")).toHaveCount(0);
  // the cell guessed is still dark after a reload (a phone that slept), the next card has none
  await page.reload();
  await open();
  await expect(board.locator("[aria-pressed=true]")).toHaveCount(1);
  await expect(board.locator("[data-cell='1']")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(full).toContainText("Big Mines · 2");
  expect(await screenRows(page)).toBe(MINES_RED[1]);
  await expect(board.locator("[aria-pressed=true]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(full).toBeHidden();
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

  // full screen fills the window; the arrow keys step through the set, Esc closes it
  await open();
  expect(await full.boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  expect(await screenRows(page)).toBe(MIRRORS_RANDOM[0]);
  await expect(board.locator("[data-mines]")).toHaveCount(0);
  // both teams' axis is vertical: across the cells a white line under a red and a blue dashed one
  await expect(board.locator("svg line")).toHaveCount(3);
  // − and + scale the board, in the middle of its space; the size is kept on the device
  const whole = (await board.boundingBox())!;
  await expect(full.getByRole("button", { name: "Zvětšit desku" })).toBeDisabled();
  await full.getByRole("button", { name: "Zmenšit desku" }).click();
  await full.getByRole("button", { name: "Zmenšit desku" }).click();
  const smaller = (await board.boundingBox())!;
  expect(smaller.width).toBeCloseTo(whole.width * 0.8, 0);
  expect(smaller.height).toBeCloseTo(whole.height * 0.8, 0);
  expect(smaller.x + smaller.width / 2).toBeCloseTo(whole.x + whole.width / 2, 0);
  expect(smaller.y + smaller.height / 2).toBeCloseTo(whole.y + whole.height / 2, 0);
  await page.keyboard.press("ArrowRight");
  expect(await screenRows(page)).toBe(MIRRORS_RANDOM[1]);
  await page.keyboard.press("Escape");
  await expect(full).toBeHidden();

  // a reload shows the same card
  await page.reload();
  await expect(card).toHaveAttribute("data-seed", "test01/2");
  await expect(card).toHaveAttribute("data-board", MIRRORS_RANDOM[1]);

  // in English the texts at the side too
  await page.context().addCookies([{ name: "botc_lang", value: "en", url: new URL(page.url()).origin }]);
  await page.reload();
  await expect(card).toHaveAttribute("data-board", MIRRORS_RANDOM[1]);
  await expect(card).toHaveAttribute("data-starts", "BLUE");
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(full).toContainText("Blue starts");
  await expect(full.locator("[data-scale]")).toHaveAttribute("data-scale", "80");
  await full.getByRole("button", { name: "Bigger board" }).click();
  await full.getByRole("button", { name: "Bigger board" }).click();
  await expect(full.getByRole("button", { name: "Bigger board" })).toBeDisabled();
  for (const [type, n] of [["RED_AGENT", 16], ["BLUE_AGENT", 18], ["CIVILIAN", 14], ["ASSASSIN", 1]] as const) await expect(count(type)).toHaveText(new RegExp(`:${n}$`));
  await page.keyboard.press("Escape");

  // back in Big Mines the mine numbers are on again, though they were turned off there
  await page.locator("label").filter({ hasText: "Big Mines" }).click();
  await expect(page.locator("input[name=showMines]")).toBeChecked();
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(board.locator("[data-mines]")).toHaveCount(42 - 3);
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
