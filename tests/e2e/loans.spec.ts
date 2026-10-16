import { writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { E2E } from "../../playwright.config";
import collection from "../../src/data/game-collection.json";
import otherNames from "../../src/data/game-names.json";
import { normalizeBarcode } from "../../src/lib/barcode";
import { guessGames, matchesWords } from "../../src/lib/game-match";
import { adminLogin, resetDb, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const CODE = "4006381333931";
const REBELLION = 4019; // "1775: Rebellion" in src/data/game-collection.json
const SIX = 4282; // "6 bere! Jubilejní edice"
const ARCHA = 12398; // "Archa Nova", also "Ark Nova"
const MARINE = 14284; // "Archa Nova: Vodní světy", an expansion of it
const AKROPOLIS = 13611;
/** The code on the box of Archa Nova, which the fake GameUPC calls Ark Nova */
const ARK_CODE = "8595558304998";
const TOTAL = collection.games.length;

/*
 * Chromium's fake camera shows a still picture of the bar code of CODE: a one-frame Y4M video (looped), drawn here
 * module by module (EAN-13: guards, six left digits in L/G parity by the first digit, six right digits in R).
 */
function eanVideo(code: string) {
  const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const R = L.map((p) => [...p].map((b) => (b === "0" ? "1" : "0")).join(""));
  const G = R.map((p) => [...p].reverse().join(""));
  const parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLG", "LGLGLG", "LGLGGL", "LGGLGL"][Number(code[0])];
  const d = [...code].map(Number);
  const modules =
    "101" +
    d.slice(1, 7).map((n, i) => (parity[i] === "L" ? L[n] : G[n])).join("") +
    "01010" +
    d.slice(7).map((n) => R[n]).join("") +
    "101";
  const [W, H, unit, top, bars] = [640, 480, 4, 140, 200];
  const left = Math.floor((W - modules.length * unit) / 2);
  const y = Buffer.alloc(W * H, 235);
  for (let row = top; row < top + bars; row++)
    for (let m = 0; m < modules.length; m++) if (modules[m] === "1") y.fill(16, row * W + left + m * unit, row * W + left + (m + 1) * unit);
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const file = join(tmpdir(), `doupe-ean-${code}.y4m`);
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\nFRAME\n`), y, chroma]));
  return file;
}

test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${eanVideo(CODE)}`] },
});

/** A fake GameUPC (GAMEUPC_URL of the test server): Ark Nova for ARK_CODE, nothing known for any other code. */
const UPC_INFO: Record<string, object> = {
  [ARK_CODE]: {
    upc: ARK_CODE,
    name: "Ark Nova",
    searched_for: "Ark Nova",
    bgg_info_status: "choose_from_bgg_info_or_search",
    bgg_info: [{ id: 342942, name: "Ark Nova" }, { id: 368966, name: "Ark Nova: Marine Worlds" }],
  },
};
const askedUpc: string[] = [];
let gameUpc: Server;
test.beforeAll(async () => {
  gameUpc = createServer((req, res) => {
    const upc = req.url?.match(/^\/upc\/(\d+)/)?.[1] ?? "";
    askedUpc.push(`${upc} ${req.headers["x-api-key"]}`);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(UPC_INFO[upc] ?? { upc, name: "None", searched_for: "None", bgg_info_status: "choose_from_bgg_info_or_search", bgg_info: [] }));
  });
  await new Promise<void>((resolve) => gameUpc.listen(E2E.gameUpcPort, "127.0.0.1", resolve));
});
test.afterAll(() => new Promise<void>((resolve) => gameUpc.close(() => resolve())));

test.beforeEach(async () => {
  await resetDb();
});

type Loan = { game_id: number; game_name: string; borrower: string | null; note: string | null; lent_by: number | null; returned_at: Date | null };
const loans = () => sql<Loan>("select game_id, game_name, borrower, note, lent_by, returned_at from game_loans order by id");
const barcodes = () => sql<{ code: string; game_id: number }>("select code, game_id from game_barcodes order by code");
const lending = () => sql<{ game_id: number; no_barcode: boolean; packed_in: number | null }>("select game_id, no_barcode, packed_in from game_lending order by game_id");

test("bar codes: EAN-13, EAN-8 and UPC-A, typos refused", () => {
  expect(normalizeBarcode("4006381333931")).toBe("4006381333931");
  expect(normalizeBarcode("4006 3813 3393 1")).toBe("4006381333931");
  expect(normalizeBarcode("96385074")).toBe("96385074");
  // a UPC-A is the same box as the EAN-13 with a leading 0
  expect(normalizeBarcode("036000291452")).toBe("0036000291452");
  expect(normalizeBarcode("4006381333932")).toBeNull();
  expect(normalizeBarcode("12345")).toBeNull();
});

test("game names: a name in English finds the game listed in Czech", () => {
  const names = otherNames.names as Record<string, string[]>;
  const games = collection.games.map((g) => ({ id: g.id, names: [g.name, ...(names[g.id] ?? [])] }));
  const name = (id: number) => collection.games.find((g) => g.id === id)?.name;
  expect(guessGames(["Ark Nova"], games).map(name)[0]).toBe("Archa Nova");
  expect(guessGames(["Ark Nova: Marine Worlds"], games).map(name)[0]).toBe("Archa Nova: Vodní světy");
  expect(guessGames(["Codenames"], games).map(name)[0]).toBe("Krycí jména");
  expect(guessGames(["Architects of the West Kingdom (Czech edition)"], games).map(name)[0]).toBe("Architekti Západního království");
  expect(guessGames(["Twitch"], games)).toEqual([]);
  expect(guessGames([], games)).toEqual([]);
  // typed: words in any case, without diacritics, punctuation as in the name
  expect(matchesWords("7 Divů světa: Duel", "7 divu sveta: duel")).toBe(true);
  expect(matchesWords("Jana Nováková", "jan nov")).toBe(true);
  expect(matchesWords("Jana Nováková", "nova jana x")).toBe(false);
});

test("lending: an unknown code goes to the game picked, names come from the attendance sheet, lend and return", async ({ page, context }) => {
  await sql("insert into attendance (day, first_name, last_name, affiliation) values (current_date - 7, 'Jana', 'Nováková', 'up'), (current_date - 14, 'Petr', 'Svoboda', 'none')");
  await adminLogin(page);
  // the site's header has a Klub link too
  await page.locator("[data-admin-nav]").getByRole("link", { name: "Klub" }).click();
  await page.locator("[data-admin-nav]").getByRole("link", { name: "Půjčovna" }).click();
  await expect(page.locator("h1")).toHaveText("Půjčovna her");
  // the codes and boxes are kept elsewhere
  await expect(page.getByTestId("loan-codes-known")).toHaveCount(0);
  await expect(page.getByTestId("loan-library-link")).toBeVisible();

  // a code typed (or sent by a USB reader) that nobody knows yet
  const search = page.getByTestId("loan-search");
  await search.fill("4006381333932");
  await search.press("Enter");
  await expect(page.getByTestId("loan-notice")).toContainText("Tohle není platný čárový kód");
  await search.fill(CODE);
  await search.press("Enter");
  await expect(page.getByTestId("loan-notice")).toContainText(`Kód ${CODE} zatím neznáme`);
  // the game picked next gets it
  await search.fill("rebel");
  await page.getByTestId("loan-found").getByRole("button", { name: /1775: Rebellion/ }).click();
  await expect(page.getByTestId("loan-notice")).toContainText(`Kód ${CODE} teď patří ke hře 1775: Rebellion.`);
  await expect(page.getByTestId("loan-game")).toContainText("1775: Rebellion");
  await expect(page.getByTestId("loan-code")).toHaveCount(0);
  expect(await barcodes()).toEqual([{ code: CODE, game_id: REBELLION }]);

  // a second tab with the same game open, to try lending it twice
  const other = await context.newPage();
  await other.goto(`/admin/pujcovna?hra=${REBELLION}`);
  await expect(other.getByTestId("loan-form")).toBeVisible();

  // names from the attendance sheet, without diacritics too
  const game = page.getByTestId("loan-game");
  await game.getByTestId("loan-borrower").fill("jana nov");
  await game.getByTestId("loan-people").getByRole("button", { name: "Jana Nováková" }).click();
  await expect(game.getByTestId("loan-borrower")).toHaveValue("Jana Nováková");
  await game.getByLabel("Poznámka (nepovinné)").fill("do čtvrtka");
  await game.getByRole("button", { name: "Půjčit", exact: true }).click();
  await expect(page.getByTestId("loan-notice")).toContainText("Půjčeno: 1775: Rebellion → Jana Nováková.");
  await expect(page.getByTestId("loan-game")).toHaveCount(0);
  await expect(page.getByTestId("loan-open")).toContainText("Jana Nováková");
  await expect(page.getByTestId("loan-open")).toContainText("dnes");
  let saved = await loans();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ game_id: REBELLION, game_name: "1775: Rebellion", borrower: "Jana Nováková", note: "do čtvrtka", returned_at: null });
  expect(saved[0].lent_by).not.toBeNull();

  // one game, one borrower at a time
  await other.getByTestId("loan-borrower").fill("Petr Svoboda");
  await other.getByRole("button", { name: "Půjčit", exact: true }).click();
  await expect(other.getByTestId("loan-notice")).toContainText("1775: Rebellion už je půjčená: Jana Nováková.");
  expect(await loans()).toHaveLength(1);
  await other.close();

  // the box comes back: read the code again, one tap
  await search.fill(CODE);
  await search.press("Enter");
  await expect(page.getByTestId("loan-status")).toContainText("Půjčená: Jana Nováková");
  await page.getByTestId("loan-status").getByRole("button", { name: "✓ Vráceno" }).click();
  await expect(page.getByTestId("loan-notice")).toContainText("Vráceno: 1775: Rebellion.");
  await expect(page.getByTestId("loan-open")).toHaveCount(0);
  await expect(page.getByTestId("loan-returned")).toContainText("Jana Nováková");
  saved = await loans();
  expect(saved[0].returned_at).not.toBeNull();

  // who had it last, when it's opened again
  await search.fill(CODE);
  await search.press("Enter");
  await expect(page.getByTestId("loan-game")).toContainText("Naposledy: Jana Nováková");

  // a name typed by hand is kept tidy and suggested next time
  await page.getByTestId("loan-borrower").fill("  Karel   Nový ");
  await page.getByRole("button", { name: "Půjčit", exact: true }).click();
  await expect(page.getByTestId("loan-notice")).toContainText("Půjčeno: 1775: Rebellion → Karel Nový.");
  await search.fill("6 bere");
  await page.getByTestId("loan-found").getByRole("button", { name: /6 bere!/ }).click();
  await page.getByTestId("loan-borrower").fill("kar");
  await expect(page.getByTestId("loan-people")).toContainText("Karel Nový");
  // the list of games out: return with a confirmation
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("loan-open").getByRole("button", { name: "✓ Vráceno" }).click();
  await expect(page.getByTestId("loan-notice")).toContainText("Vráceno: 1775: Rebellion.");
  expect((await loans()).map((l) => [l.game_id, l.borrower, l.returned_at !== null])).toEqual([
    [REBELLION, "Jana Nováková", true],
    [REBELLION, "Karel Nový", true],
  ]);

  // a code given to the wrong game is removed in Správa knihovny; a UPC-A is kept as its EAN-13
  await page.goto(`/admin/pujcovna?hra=${REBELLION}`);
  await page.getByTestId("loan-to-library").click();
  await expect(page.locator("h1")).toHaveText("Správa knihovny");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Půjčovna" })).toHaveAttribute("aria-current", "page");
  // the guide opens under the intro
  const guide = page.getByTestId("library-guide");
  await expect(guide.getByRole("heading", { name: "Hra s víc kódy" })).toBeHidden();
  await guide.locator("summary").click();
  await expect(guide.getByRole("heading", { name: "Hra s víc kódy" })).toBeVisible();
  await expect(guide).toContainText("Krabice kód nemá");
  await expect(page.getByTestId("loan-codes-known")).toContainText("u 1 z");
  await expect(page.getByTestId("loan-game")).toContainText("1775: Rebellion");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: `Odebrat kód ${CODE}` }).click();
  await expect(page.getByTestId("loan-notice")).toContainText(`Kód ${CODE} je odebraný.`);
  expect(await barcodes()).toEqual([]);
  await page.getByTestId("loan-search").fill("036000291452");
  await page.getByTestId("loan-search").press("Enter");
  await expect(page.getByTestId("loan-notice")).toContainText("Kód 0036000291452 zatím neznáme");
  await page.getByTestId("loan-search").fill("6 bere");
  await page.getByTestId("loan-found").getByRole("button", { name: /6 bere!/ }).click();
  await expect(page.getByTestId("loan-notice")).toContainText("teď patří ke hře 6 bere!");
  expect(await barcodes()).toEqual([{ code: "0036000291452", game_id: SIX }]);

  // the history knows the game, never who borrowed it
  const log = await sql<{ action: string; data: string }>("select action, data::text from admin_log where action like 'loan.%' order by id");
  expect(log.map((r) => r.action)).toEqual(["loan.code", "loan.lend", "loan.return", "loan.lend", "loan.return", "loan.codeRemove", "loan.code"]);
  expect(log.map((r) => r.data).join(" ")).not.toMatch(/Nováková|Karel/);
  await page.goto("/admin/historie");
  await expect(page.getByTestId("log-entry").filter({ hasText: "Půjčená hra" }).first()).toContainText("1775: Rebellion");
});

test("lending: the camera reads the code on the box", async ({ page }) => {
  await sql("insert into game_barcodes (code, game_id) values ($1, $2)", [CODE, REBELLION]);
  await adminLogin(page);
  await page.goto("/admin/pujcovna");
  await page.getByTestId("loan-scan").click();
  await expect(page.getByTestId("barcode-scanner")).toBeVisible();
  // the fake camera shows the box's code: the game opens and the camera closes
  await expect(page.getByTestId("loan-game")).toContainText("1775: Rebellion", { timeout: 20_000 });
  await expect(page.getByTestId("barcode-scanner")).toHaveCount(0);
  await expect(page.getByTestId("loan-form")).toBeVisible();

  // the reader for browsers without their own is a file of this site
  const wasm = await page.request.get("/admin/pujcovna/zxing_reader.wasm");
  expect(wasm.headers()["content-type"]).toBe("application/wasm");
  expect((await wasm.body()).subarray(0, 4)).toEqual(Buffer.from([0, 0x61, 0x73, 0x6d]));
});

test("lending: GameUPC suggests the game of an unknown code, other names are searched too", async ({ page }) => {
  askedUpc.length = 0;
  await adminLogin(page);
  await page.goto("/admin/pujcovna");
  const search = page.getByTestId("loan-search");
  await search.fill(ARK_CODE);
  await search.press("Enter");
  await expect(page.getByTestId("loan-notice")).toContainText(`Kód ${ARK_CODE} zatím neznáme`);
  const guess = page.getByTestId("loan-guess");
  await expect(guess).toContainText("Podle GameUPC je to „Ark Nova“");
  // the best fit first: the base game, then its expansion by the other name GameUPC gave, at most three
  await expect(guess.getByRole("button")).toHaveText([/^Archa Nova \(/, /^Archa Nova: Vodní světy/, /^Archa Nova: Plány zoo/]);
  await guess.getByRole("button", { name: /^Archa Nova \(/ }).click();
  await expect(page.getByTestId("loan-notice")).toContainText(`Kód ${ARK_CODE} teď patří ke hře Archa Nova.`);
  await expect(page.getByTestId("loan-game")).toContainText("Archa Nova");
  await expect(page.getByTestId("loan-guess")).toHaveCount(0);
  expect(await barcodes()).toEqual([{ code: ARK_CODE, game_id: ARCHA }]);
  // our key goes along: the public test one without GAMEUPC_API_KEY
  expect(askedUpc).toContain(`${ARK_CODE} test_test_test_test_test`);

  // a code GameUPC knows nothing about: only the question
  await search.fill("036000291452");
  await search.press("Enter");
  await expect(page.getByTestId("loan-notice")).toContainText("Kód 0036000291452 zatím neznáme");
  // a UPC-A is asked both ways, GameUPC keeps them apart
  await expect.poll(() => askedUpc.filter((a) => a.startsWith("036000291452 ") || a.startsWith("0036000291452 ")).length).toBe(2);
  await expect(page.getByTestId("loan-guess")).toHaveCount(0);
  await page.getByRole("button", { name: "Zahodit kód" }).click();

  // the name on an English box finds the Czech edition
  await search.fill("ark nova");
  await expect(page.getByTestId("loan-found").getByRole("button").first()).toContainText("Archa Nova");
  await expect(page.getByTestId("loan-found").getByRole("button").first()).toContainText("též Ark Nova");
});

test("lending: several games to one person, box after box", async ({ page }) => {
  await sql("insert into game_barcodes (code, game_id) values ($1, $2), ($3, $4)", [CODE, REBELLION, ARK_CODE, ARCHA]);
  await sql("insert into game_loans (game_id, game_name, borrower) values ($1, '6 bere! Jubilejní edice', 'Petr Svoboda')", [SIX]);
  await sql("insert into attendance (day, first_name, last_name, affiliation) values (current_date - 7, 'Jana', 'Nováková', 'up')");
  await adminLogin(page);
  await page.goto(`/admin/pujcovna?hra=${AKROPOLIS}`);
  // the game shown is the first on the list, the name typed stays
  await page.getByTestId("loan-borrower").fill("jana nov");
  await page.getByTestId("loan-batch-start").click();
  const batch = page.getByTestId("loan-batch");
  await expect(page.getByTestId("loan-game")).toHaveCount(0);
  await expect(batch.getByTestId("loan-batch-games")).toHaveText(/Akropolis/);
  await batch.getByTestId("loan-people").getByRole("button", { name: "Jana Nováková" }).click();

  // the camera stays on and takes each box once, however long it is held up
  await page.getByTestId("loan-scan").click();
  await expect(batch.getByTestId("loan-batch-games")).toContainText("1775: Rebellion", { timeout: 20_000 });
  await expect(page.getByTestId("barcode-scanner")).toBeVisible();
  await expect(page.getByTestId("loan-notice")).toContainText("Přidáno: 1775: Rebellion.");
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("loan-notice")).toContainText("Přidáno: 1775: Rebellion.");
  await page.getByRole("button", { name: "Zavřít foťák" }).click();

  // typed codes and names add too; a game out or on the list already does not
  const search = page.getByTestId("loan-search");
  await search.fill(CODE);
  await search.press("Enter");
  await expect(page.getByTestId("loan-notice")).toContainText("1775: Rebellion už v seznamu je.");
  // the game read again stands out on the list, the chosen ones in the search
  await expect(batch.locator('[aria-current="true"]')).toHaveText(/1775: Rebellion/);
  await search.fill("akropolis");
  await expect(page.getByTestId("loan-found").getByRole("button").first()).toContainText("✓ Vybraná");
  await search.fill("6 bere");
  await page.getByTestId("loan-found").getByRole("button", { name: /6 bere!/ }).click();
  await expect(page.getByTestId("loan-notice")).toContainText("6 bere! Jubilejní edice je půjčená: Petr Svoboda.");
  await search.fill(ARK_CODE);
  await search.press("Enter");
  await expect(page.getByTestId("loan-notice")).toContainText("Přidáno: Archa Nova.");
  await expect(batch.getByTestId("loan-batch-games").getByRole("listitem")).toHaveCount(3);
  await batch.getByRole("button", { name: "Odebrat ze seznamu Archa Nova" }).click();
  await expect(batch.getByTestId("loan-batch-games").getByRole("listitem")).toHaveCount(2);

  // the open loans wait under the panel until the games are lent
  await expect(page.getByTestId("loan-open")).toHaveCount(0);
  await batch.getByLabel("Poznámka (nepovinné)").fill("na chatu");
  await batch.getByRole("button", { name: "Půjčit 2 hry → Jana Nováková" }).click();
  await expect(page.getByTestId("loan-notice")).toContainText("Půjčeno 2 hry → Jana Nováková: Akropolis, 1775: Rebellion.");
  await expect(page.getByTestId("loan-batch")).toHaveCount(0);
  expect((await loans()).map((l) => [l.game_id, l.borrower, l.note])).toEqual([
    [SIX, "Petr Svoboda", null],
    [AKROPOLIS, "Jana Nováková", "na chatu"],
    [REBELLION, "Jana Nováková", "na chatu"],
  ]);
  await expect(page.getByTestId("loan-open").getByRole("listitem")).toHaveCount(3);
});

test("library: the games without a code, a box read for the game shown", async ({ page }) => {
  await sql("insert into game_barcodes (code, game_id) values ($1, $2)", [CODE, REBELLION]);
  await adminLogin(page);
  await page.goto("/admin/pujcovna");
  await page.getByTestId("loan-library-link").click();
  await expect(page.locator("h1")).toHaveText("Správa knihovny");
  const missing = page.getByTestId("loan-missing");
  await expect(missing.locator("summary")).toHaveText(`Hry bez čárového kódu (${TOTAL - 1})`);
  await expect(missing.getByRole("button", { name: "1775: Rebellion" })).toHaveCount(0);
  // the list searched by the name or another one; a game with a code is not in it
  const search = missing.getByTestId("loan-missing-search");
  await search.fill("rebel");
  await expect(missing.getByRole("listitem")).toHaveText(["Princezny rebelky"]);
  await search.fill("ark nova");
  await expect(missing.getByRole("listitem")).toHaveCount(3);
  await expect(missing.getByRole("listitem").first()).toHaveText(/^Archa Nova\s*též Ark Nova$/);
  await search.fill("1775");
  await expect(missing).toContainText("Žádná hra ze sbírky neodpovídá.");
  await search.fill("6 bere");
  await missing.getByRole("button", { name: /^6 bere! Jubilejní edice/ }).click();
  const game = page.getByTestId("loan-game");
  await expect(game).toContainText("6 bere! Jubilejní edice");
  await expect(game).toContainText("Kód krabice zatím neznáme");

  // the camera reads the code of another game's box: asked before it moves
  page.once("dialog", (d) => {
    expect(d.message()).toBe(`Kód ${CODE} patří ke hře 1775: Rebellion. Dát ho téhle hře?`);
    d.accept();
  });
  await game.getByTestId("loan-add-code").click();
  await expect(page.getByTestId("loan-notice")).toContainText(`Kód ${CODE} teď patří ke hře 6 bere! Jubilejní edice.`, { timeout: 20_000 });
  expect(await barcodes()).toEqual([{ code: CODE, game_id: SIX }]);
  await expect(game.getByTestId("loan-code")).toHaveText(new RegExp(CODE));
  // the search stays as it was: 1775 is back in the list, but not among "6 bere"
  await expect(search).toHaveValue("6 bere");
  await search.clear();
  await expect(missing.getByRole("button", { name: "1775: Rebellion" })).toHaveCount(1);
  await expect(missing.getByRole("button", { name: /^6 bere! Jubilejní edice/ })).toHaveCount(0);

  // read again: it is this game's already
  await game.getByTestId("loan-add-code").click();
  await expect(page.getByTestId("loan-notice")).toContainText(`Kód ${CODE} už u téhle hry je.`, { timeout: 20_000 });
});

test("lending: a box without a code, a bundle found by a code of any of its games, lent and returned together", async ({ page }) => {
  // the expansion still has its own box with its code
  await sql("insert into game_barcodes (code, game_id) values ($1, $2)", [CODE, MARINE]);
  await adminLogin(page);
  await page.goto(`/admin/pujcovna/knihovna?hra=${SIX}`);
  const game = page.getByTestId("loan-game");
  const notice = page.getByTestId("loan-notice");
  const missing = page.getByTestId("loan-missing");
  await expect(missing.locator("summary")).toHaveText(`Hry bez čárového kódu (${TOTAL - 1})`);

  // the box of 6 bere! has no code: out of the list of games without one, found by its name
  await game.getByRole("button", { name: "Krabice kód nemá" }).click();
  await expect(notice).toContainText("6 bere! Jubilejní edice: krabice kód nemá, hra se hledá podle názvu.");
  await expect(game.getByTestId("loan-no-barcode")).toBeVisible();
  await expect(missing.locator("summary")).toHaveText(`Hry bez čárového kódu (${TOTAL - 2})`);
  await expect(page.getByTestId("loan-no-code").locator("summary")).toHaveText("Krabice bez kódu (1)");
  await expect(page.getByTestId("loan-codes-known")).toHaveText(`Čárový kód známe u 1 z ${TOTAL} her, 1 hra kód nemá.`);
  expect(await lending()).toEqual([{ game_id: SIX, no_barcode: true, packed_in: null }]);
  // taken back: missing again
  await game.getByRole("button", { name: "Zrušit" }).click();
  await expect(notice).toContainText("6 bere! Jubilejní edice je zpátky mezi hrami bez čárového kódu.");
  await expect(page.getByTestId("loan-no-code")).toHaveCount(0);
  await game.getByRole("button", { name: "Krabice kód nemá" }).click();
  await expect(page.getByTestId("loan-no-code")).toBeVisible();

  // Vodní světy built into the box of Archa Nova
  const search = page.getByTestId("loan-search");
  await search.fill("archa nova");
  await page.getByTestId("loan-found").getByRole("button", { name: /^Archa Nova \(/ }).click();
  await expect(game.getByTestId("loan-box")).toContainText("jen tahle hra");
  await game.getByTestId("loan-pack-add").click();
  const pack = game.getByTestId("loan-pack");
  await pack.getByRole("searchbox").fill("vodni svety");
  await pack.getByRole("button", { name: /Archa Nova: Vodní světy/ }).click();
  await expect(notice).toContainText("Archa Nova: Vodní světy je v krabici hry Archa Nova a půjčuje se s ní.");
  await expect(game.getByTestId("loan-bundle")).toHaveText(/Balíček:\s*Archa Nova\s*\+ Archa Nova: Vodní světy/);
  expect(await lending()).toEqual([
    { game_id: SIX, no_barcode: true, packed_in: null },
    { game_id: MARINE, no_barcode: false, packed_in: ARCHA },
  ]);
  // the expansion's code finds the bundle: neither game is missing a code now
  await expect(game).toContainText("Vlastní kód nemá, balíček najde kód jiné hry z krabice.");
  await expect(missing.locator("summary")).toHaveText(`Hry bez čárového kódu (${TOTAL - 3})`);
  await expect(page.getByTestId("loan-codes-known")).toContainText(`u 2 z ${TOTAL} her`);
  await expect(page.getByTestId("loan-bundles").locator("li")).toHaveText([/^Archa Nova\s*\+ Archa Nova: Vodní světy$/]);
  // boxes don't nest: a box with games in it is not offered for another box
  await search.fill("akropolis");
  await page.getByTestId("loan-found").getByRole("button").first().click();
  await game.getByTestId("loan-pack-add").click();
  await pack.getByRole("searchbox").fill("archa nova");
  await expect(pack.getByRole("button", { name: /Archa Nova: Plány zoo/ })).toHaveCount(1);
  await expect(pack.getByRole("button", { name: /^Archa Nova \(/ })).toHaveCount(0);
  await expect(pack.getByRole("button", { name: /Vodní světy/ })).toContainText("v krabici hry Archa Nova");
  await pack.getByRole("button", { name: "Zrušit" }).click();
  await search.fill(CODE);
  await search.press("Enter");
  await expect(game.locator("h3")).toContainText("Archa Nova: Vodní světy");
  await expect(game.getByTestId("loan-box")).toContainText("je v krabici hry Archa Nova");

  // at the desk, the code read: the game it belongs to, lent with the whole bundle
  await game.getByTestId("loan-to-desk").click();
  await expect(page.locator("h1")).toHaveText("Půjčovna her");
  await expect(game.locator("h3")).toContainText("Archa Nova: Vodní světy");
  await expect(game.getByTestId("loan-box")).toHaveCount(0);
  await search.fill(CODE);
  await search.press("Enter");
  await expect(game.locator("h3")).toContainText("Archa Nova: Vodní světy");
  const bundleGames = game.getByTestId("loan-bundle-games");
  await expect(bundleGames.getByRole("checkbox")).toHaveCount(2);
  await game.getByTestId("loan-borrower").fill("Petr Svoboda");
  await game.getByRole("button", { name: "Půjčit 2 hry" }).click();
  await expect(notice).toContainText("Půjčeno 2 hry → Petr Svoboda: Archa Nova, Archa Nova: Vodní světy.");
  expect((await loans()).map((l) => [l.game_id, l.borrower])).toEqual([
    [ARCHA, "Petr Svoboda"],
    [MARINE, "Petr Svoboda"],
  ]);
  // one row of the open loans, returned together
  const open = page.getByTestId("loan-open").getByRole("listitem");
  await expect(open).toHaveCount(1);
  await expect(open).toContainText("📦 Archa Nova + Archa Nova: Vodní světy");
  page.once("dialog", (d) => {
    expect(d.message()).toBe("Je vrácený celý balíček: Archa Nova, Archa Nova: Vodní světy?");
    d.accept();
  });
  await open.getByRole("button", { name: "✓ Vráceno" }).click();
  await expect(notice).toContainText("Vráceno: Archa Nova, Archa Nova: Vodní světy.");
  expect((await loans()).every((l) => l.returned_at !== null)).toBe(true);

  // lending several: a game of the bundle brings the others along
  await page.getByTestId("loan-batch-start").click();
  await search.fill(CODE);
  await search.press("Enter");
  await expect(notice).toContainText("Přidáno: Archa Nova: Vodní světy, Archa Nova.");
  await expect(page.getByTestId("loan-batch-games").getByRole("listitem")).toHaveCount(2);
  await page.getByTestId("loan-batch").getByRole("button", { name: "Zrušit" }).click();

  // only the base game, the expansion unticked
  await search.fill("archa nova");
  await page.getByTestId("loan-found").getByRole("button", { name: /^Archa Nova \(/ }).click();
  await bundleGames.getByLabel("Archa Nova: Vodní světy").uncheck();
  await game.getByTestId("loan-borrower").fill("Jana Nováková");
  await game.getByRole("button", { name: "Půjčit", exact: true }).click();
  await expect(notice).toContainText("Půjčeno: Archa Nova → Jana Nováková.");
  // then the expansion too: the base game is shown as lent
  await search.fill(CODE);
  await search.press("Enter");
  await expect(bundleGames.getByRole("checkbox").first()).toBeDisabled();
  await expect(bundleGames).toContainText("Půjčená: Jana Nováková");
  await game.getByTestId("loan-borrower").fill("Jana Nováková");
  await game.getByRole("button", { name: "Půjčit", exact: true }).click();
  await expect(notice).toContainText("Půjčeno: Archa Nova: Vodní světy → Jana Nováková.");
  // back from the game: only it, or the whole bundle
  await search.fill(CODE);
  await search.press("Enter");
  await game.getByRole("button", { name: "Vrátit jen tuhle hru" }).click();
  await expect(notice).toContainText("Vráceno: Archa Nova: Vodní světy.");
  await expect(page.getByTestId("loan-open").getByRole("listitem")).toHaveText([/^Archa Nova\s*Jana Nováková/]);

  // out of the box: lent on its own, missing a code again
  await page.goto("/admin/pujcovna/knihovna");
  await search.fill("archa nova");
  await page.getByTestId("loan-found").getByRole("button", { name: /^Archa Nova \(/ }).click();
  await game.getByRole("button", { name: "Vyjmout z krabice: Archa Nova: Vodní světy" }).click();
  await expect(notice).toContainText("Archa Nova: Vodní světy je vyjmutá z krabice, půjčuje se zvlášť.");
  await expect(game.getByTestId("loan-bundle")).toHaveCount(0);
  await expect(missing.locator("summary")).toHaveText(`Hry bez čárového kódu (${TOTAL - 2})`);
  await expect(page.getByTestId("loan-bundles")).toHaveCount(0);
  expect((await lending()).find((r) => r.game_id === MARINE)?.packed_in).toBeNull();

  // the history
  const log = await sql<{ action: string }>("select action from admin_log where action in ('loan.noBarcode', 'loan.pack') order by id");
  expect(log.map((r) => r.action)).toEqual(["loan.noBarcode", "loan.noBarcode", "loan.noBarcode", "loan.pack", "loan.pack"]);
  await page.goto("/admin/historie");
  await expect(page.getByTestId("log-entry").filter({ hasText: "Hra v krabici jiné hry" }).first()).toContainText("vyjmutá z krabice");
  await expect(page.getByTestId("log-entry").filter({ hasText: "Hra v krabici jiné hry" }).last()).toContainText("📦 Archa Nova");
});

test("lending: overview count, names deleted a year after the return", async ({ page, request }) => {
  await sql(
    `insert into game_loans (game_id, game_name, borrower, note, lent_at, returned_at) values
      (${REBELLION}, '1775: Rebellion', 'Stará Výpůjčka', 'chybí kostka', now() - interval '400 days', now() - interval '380 days'),
      (${SIX}, '6 bere! Jubilejní edice', 'Nová Výpůjčka', null, now() - interval '3 days', null)`,
  );
  const res = await request.get("/api/cron/reminders", { headers: { authorization: "Bearer e2e-cron" } });
  expect((await res.json()).loans).toEqual({ anonymized: 1 });
  expect((await loans()).map((l) => [l.borrower, l.note])).toEqual([
    [null, null],
    ["Nová Výpůjčka", null],
  ]);
  await adminLogin(page);
  await expect(page.getByTestId("overview-loans")).toContainText("1 hra půjčená");
  await page.goto("/admin/pujcovna");
  await expect(page.getByTestId("loan-open")).toContainText("3 dny");
  await expect(page.getByTestId("loan-returned")).toContainText("(jméno smazáno)");
});
