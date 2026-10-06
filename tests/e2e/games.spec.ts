import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { BOTC_ZATROLENE_ID, isPrivateGame, PageChangedError, parseClubCollection, type CollectionGame } from "../../src/lib/zatrolene";

/** What `npm run hry` saved and the games page shows */
const data: { updatedAt: string; games: CollectionGame[] } = JSON.parse(
  readFileSync("src/data/game-collection.json", "utf8"),
);

test("reading the club's page on Zatrolené hry (a trimmed copy)", () => {
  const html = readFileSync("tests/e2e/fixtures/zatrolene-klub.html", "utf8");
  const games = parseClubCollection(html);
  expect(games).toHaveLength(9);
  const game = (name: string) => games.find((g) => g.name.startsWith(name));
  expect(game("1775: Rebellion")).toEqual({
    id: 4019,
    name: "1775: Rebellion",
    year: 2013,
    url: "https://www.zatrolene-hry.cz/spolecenska-hra/1775-rebellion-4019",
    expansion: false,
    minPlayers: 2,
    maxPlayers: 4,
    note: null,
  });
  // "&" in a name, an expansion, a year BC, a note on two lines becomes one
  expect(game("Kemet")).toMatchObject({ name: "Kemet: Blood & Sand - Rise of the Gods", expansion: true });
  expect(game("Kostky")).toMatchObject({ year: -5000, minPlayers: 2, maxPlayers: 99 });
  expect(game("CVlizations")?.note).toBe("Uskladněno u Kryštofa; anglická verze");
  expect(isPrivateGame(game("7 Divů světa")!)).toBe(true);
  expect(isPrivateGame(game("1775")!)).toBe(false);

  // a changed or half-read page never replaces a good list
  expect(() => parseClubCollection("<html><body><h1>Nový vzhled</h1></body></html>")).toThrow(PageChangedError);
  expect(() => parseClubCollection(html.replace("Sbírka her (9)", "Sbírka her (10)"))).toThrow("The page lists 9 of 10 games");
});

test("games page: the club's list with search and filters, in both languages", async ({ page }) => {
  const total = data.games.length;
  const count = (keep: (g: CollectionGame) => boolean) => data.games.filter(keep).length;

  // a subpage of the club: linked from the club page, the club stays marked in the menu
  await page.goto("/");
  await page.click("main a:has-text('sbírka her')");
  await expect(page).toHaveURL(/\/hry$/);
  await expect(page.locator("header nav a[aria-current=page]")).toHaveText("Klub");
  await expect(page.locator("h1")).toHaveText("Sbírka her");

  const main = page.locator("main");
  const items = main.locator("li");
  await expect(main).toContainText(`Zobrazeno ${total} z ${total}`);
  await expect(items).toHaveCount(total);
  // each game links to its page on Zatrolené hry, with the year and player count in words
  const first = data.games[0];
  await expect(items.first().getByRole("link", { name: first.name, exact: true })).toHaveAttribute("href", first.url);
  await expect(items.first()).toContainText(`(${first.year})`);
  await expect(main).toContainText("Seznam vedeme na Zatrolených hrách, sem ho přenášíme ručně – naposledy");
  // Blood on the Clocktower has its own section
  await items.filter({ hasText: "Krvavá hodina odbila" }).getByRole("link", { name: /Hrajeme pravidelně/ }).click();
  await expect(page).toHaveURL(/\/botc$/);
  await page.goBack();
  expect(data.games.some((g) => g.id === BOTC_ZATROLENE_ID)).toBe(true);

  // search ignores case and diacritics and looks into the notes too
  await page.fill("input[type=search]", "KRYSTOF");
  await expect(items).toHaveCount(count((g) => /Kryštof/i.test(`${g.name} ${g.note ?? ""}`)));
  await page.fill("input[type=search]", "");

  await page.selectOption("select", "6");
  const forSix = (g: CollectionGame) => g.minPlayers <= 6 && 6 <= g.maxPlayers;
  await expect(items).toHaveCount(count(forSix));
  await page.check("text=Jen klubové hry");
  await expect(items).toHaveCount(count((g) => forSix(g) && !isPrivateGame(g)));
  await page.selectOption("select", "0");
  await page.uncheck("text=Jen klubové hry");
  await page.check("text=Bez rozšíření");
  await expect(items).toHaveCount(count((g) => !g.expansion));
  await page.fill("input[type=search]", "monopoly xyz");
  await expect(main).toContainText("Filtru neodpovídá žádná hra.");

  // the filters stay as they are when switching the language
  await page.click("header button:has-text('English')");
  await expect(page.locator("h1")).toHaveText("Game collection");
  await expect(main).toContainText("No game matches the filter.");
  await page.fill("input[type=search]", "");
  await expect(main).toContainText("copy it here by hand, last on");
  await page.click("text=← Back to the club");
  await expect(page).toHaveURL(/\/$/);
});
