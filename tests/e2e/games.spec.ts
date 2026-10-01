import { expect, test } from "@playwright/test";
import { adminLogin, resetDb, setZatroleneMode, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
  await setZatroleneMode("ok");
});

test.afterAll(async () => {
  await setZatroleneMode("ok");
});

/** The list counts as checked this long ago, so the next visit reads Zatrolené hry again. */
async function checkedAgo(minutes: number) {
  await sql(`update game_collection set checked_at = now() - interval '${minutes} minutes'`);
}

test("games page: the club's list from Zatrolené hry with search and filters, in both languages", async ({ page }) => {
  await page.goto("/");
  await page.click("header nav a:has-text('Hry')");
  await expect(page).toHaveURL(/\/hry$/);
  await expect(page.locator("header nav a[aria-current=page]")).toHaveText("Hry");
  await expect(page.locator("h1")).toHaveText("Sbírka her");

  const main = page.locator("main");
  const items = main.locator("li");
  await expect(main).toContainText("Zobrazeno 9 z 9");
  await expect(items).toHaveCount(9);
  // each game links to its page on Zatrolené hry; "&" in a name, a year BC
  await expect(page.getByRole("link", { name: "Kemet: Blood & Sand - Rise of the Gods" })).toHaveAttribute(
    "href",
    "https://www.zatrolene-hry.cz/spolecenska-hra/kemet-blood-sand-rise-of-the-gods-18024",
  );
  await expect(items.filter({ hasText: "Kemet" })).toContainText("rozšíření");
  await expect(items.filter({ hasText: "Kostky" })).toContainText("(-5000)");
  // player counts in words, the club's notes; a note on two lines becomes one
  await expect(items.filter({ hasText: "1775: Rebellion" })).toContainText("2–4 hráči");
  await expect(items.filter({ hasText: "7 Divů světa" })).toContainText("3–7 hráčů");
  await expect(items.filter({ hasText: "7 Divů světa" })).toContainText("soukromá hra (Krápník); jazykově nezávislá");
  await expect(items.filter({ hasText: "Nebe v plamenech" })).toContainText("1 hráč");
  await expect(items.filter({ hasText: "Kostky" })).toContainText("od 2 hráčů");
  await expect(items.filter({ hasText: "CVlizations" })).toContainText("Uskladněno u Kryštofa; anglická verze");
  // Blood on the Clocktower has its own section
  await items.filter({ hasText: "Krvavá hodina odbila" }).getByRole("link", { name: /Hrajeme pravidelně/ }).click();
  await expect(page).toHaveURL(/\/botc$/);
  await page.goBack();

  // search ignores case and diacritics and looks into the notes too
  await page.fill("input[type=search]", "divu");
  await expect(items).toHaveCount(1);
  await expect(main).toContainText("Zobrazeno 1 z 9");
  await page.fill("input[type=search]", "kryštof");
  await expect(items).toHaveCount(3);
  await page.fill("input[type=search]", "");

  await page.selectOption("select", "6");
  await expect(items).toHaveCount(4);
  await page.check("text=Jen klubové hry");
  await expect(items).toHaveCount(2);
  await expect(main).not.toContainText("7 Divů světa");
  await page.selectOption("select", "0");
  await page.uncheck("text=Jen klubové hry");
  await page.check("text=Bez rozšíření");
  await expect(items).toHaveCount(8);
  await expect(main).not.toContainText("Kemet");
  await page.fill("input[type=search]", "monopoly");
  await expect(main).toContainText("Filtru neodpovídá žádná hra.");

  await expect(main).toContainText("Naposledy načteno");
  const [row] = await sql<{ n: number; error: string | null }>(
    "select jsonb_array_length(games) as n, error from game_collection",
  );
  expect(row).toEqual({ n: 9, error: null });

  // the filters stay as they are when switching the language
  await page.click("header button:has-text('English')");
  await expect(page.locator("h1")).toHaveText("Game collection");
  await expect(main).toContainText("No game matches the filter.");
  await page.fill("input[type=search]", "");
  await expect(items.filter({ hasText: "1775: Rebellion" })).toContainText("2–4 players");
  await expect(items.filter({ hasText: "Kostky" })).toContainText("2+ players");
});

test("games page: a failed read keeps the last list, the admin shows it and reads it again", async ({ page }) => {
  await page.goto("/hry");
  await expect(page.locator("main li")).toHaveCount(9);

  // fresh lists are not read again
  await setZatroleneMode("changed");
  await page.reload();
  expect((await sql<{ error: string | null }>("select error from game_collection"))[0].error).toBeNull();

  // an old one is shown as it is and read after the response
  await checkedAgo(90);
  await page.reload();
  await expect(page.locator("main li")).toHaveCount(9);
  await expect
    .poll(async () => (await sql<{ error: string | null }>("select error from game_collection"))[0].error)
    .toBe("No games found on the page");
  await page.reload();
  await expect(page.locator("main li")).toHaveCount(9);

  await adminLogin(page);
  const main = page.locator("main");
  await expect(main).toContainText("Seznam her se při posledním pokusu nepodařilo načíst ze Zatrolených her (No games found on the page).");
  await expect(main).toContainText("Stránka Hry dál ukazuje seznam načtený");
  await setZatroleneMode("ok");
  // the warning goes away with the error
  await main.locator("button:has-text('Zkusit znovu')").click();
  await expect(main).not.toContainText("Seznam her se při posledním pokusu");
  await page.reload();
  await expect(main).not.toContainText("Seznam her se při posledním pokusu");

  // signed-in organisers can read it right away, e.g. after editing it on Zatrolené hry
  await page.goto("/hry");
  await page.click("main button:has-text('Načíst znovu ze Zatrolených her')");
  await expect(page.locator("main")).toContainText("Načteno 9 her.");
});

test("games page: without a list yet it points to Zatrolené hry and tries again a bit later", async ({ page }) => {
  await setZatroleneMode("down");
  await page.goto("/hry");
  const main = page.locator("main");
  await expect(main).toContainText("Seznam her se teď nepodařilo načíst. Najdeš ho na Zatrolených hrách.");
  await expect(main.locator("li")).toHaveCount(0);
  expect((await sql<{ error: string | null }>("select error from game_collection"))[0].error).toBe("HTTP 503");

  // not on every visit
  await setZatroleneMode("ok");
  await page.reload();
  await expect(main).toContainText("Seznam her se teď nepodařilo načíst.");

  await checkedAgo(20);
  await page.reload();
  await expect(main.locator("li")).toHaveCount(9);
});
