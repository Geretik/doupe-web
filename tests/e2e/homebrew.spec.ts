import { gunzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";
import homebrewList from "../../src/data/homebrew-roles.json";
import homebrewData from "../../src/data/homebrew-characters.json";
import homebrewCs from "../../src/data/homebrew-cs.json";
import { characterName, findRole, findStorytellerRole, homebrewRoles, matchHomebrew, roleIcon } from "../../src/modules/botc/lib/botc-roles";
import { resolveRoleSource, roleIdsFromScriptJson } from "../../src/modules/botc/lib/draft/roles";
import { grimoireCharacters } from "../../src/modules/botc/lib/grimoire/characters";
import { grimoireStateSchema } from "../../src/modules/botc/lib/grimoire/schema";
import { newGrimoireState, newSeat, nightSteps } from "../../src/modules/botc/lib/grimoire/state";
import { homebrewGrimoireCharacters, withHomebrewInFull } from "../../src/modules/botc/lib/homebrew";
import { adminLogin, createSession, resetDb, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
});

type Data = { ability: string; firstNight: number; firstNightReminder: string; otherNight: number; reminders: string[]; image?: string };
const data = homebrewData as Record<string, Data>;
type Czech = { name: string; ability: string; firstNightReminder: string; reminders: string[]; h: string };
const czech = homebrewCs as Record<string, Czech>;

/** A homebrew character as the wiki's JSON writes it: its id there, its name, team and texts in full */
function wikiEntry(id: string) {
  const entry = homebrewList.roles.find((r) => r.id === id)!;
  const c = data[id];
  return { id: entry.src, name: entry.en, team: entry.team, ability: c.ability, image: c.image, firstNight: c.firstNight, firstNightReminder: c.firstNightReminder, otherNight: c.otherNight, reminders: c.reminders };
}

/** The script a script tool link opens */
function scriptOfLink(href: string) {
  return JSON.parse(gunzipSync(Buffer.from(new URL(href).searchParams.get("script")!, "base64")).toString("utf8"));
}

const COBBLER = "luis_cobbler";
/** The Cobbler in Czech: the admin pages are Czech */
const cobbler = czech[COBBLER];
/** Luis's evening: Trouble Brewing's first-night characters and the Cobbler, as a script downloaded from the wiki */
const LUIS_SCRIPT = [{ id: "_meta", name: "Luisův večer", author: "Luis S" }, "washerwoman", "chef", "empath", "poisoner", "imp", wikiEntry(COBBLER)];

test("homebrew: characters of the club's collections – a wiki script's entries matched, the grimoire's data and night, its checks, the tools get them in full", async () => {
  // lib/scripts brings the database module, whose pool takes DATABASE_URL once per process: set it first, as
  // organizer-emails.spec does, or a later spec in this worker gets a pool without it
  process.env.DATABASE_URL ??= E2E.databaseUrl;
  const { parseScriptFile } = await import("../../src/modules/botc/lib/scripts");

  // by the id here, by the id on the wiki with its name and ability
  expect(matchHomebrew(COBBLER)).toBe(COBBLER);
  expect(matchHomebrew(wikiEntry(COBBLER))).toBe(COBBLER);
  // three collections have a Cleric: the ability tells which one; without it, or with another one, it is none of them
  const clerics = homebrewList.roles.filter((r) => r.src === "cleric").map((r) => r.id);
  expect(clerics.length).toBeGreaterThan(1);
  for (const id of clerics) expect(matchHomebrew(wikiEntry(id))).toBe(id);
  expect(matchHomebrew({ id: "cleric" })).toBeNull();
  expect(matchHomebrew({ id: "cleric", name: "Cleric", ability: "Each night, learn nothing at all." })).toBeNull();
  expect(matchHomebrew("washerwoman")).toBeNull();

  // the Czech translations fit their characters: tokens in the English order, translated from today's ability
  for (const [id, cs] of Object.entries(czech)) {
    expect(data[id], id).toBeDefined();
    expect(cs.reminders.length, id).toBe(data[id].reminders.length);
    expect(cs.h, id).toBe(homebrewList.roles.find((r) => r.id === id)!.h);
  }

  // a character like the official ones: name, team, icon
  expect(findRole(COBBLER)).toMatchObject({ team: "townsfolk", en: "Cobbler", cs: cobbler.name, edition: "homebrew", collection: "luis" });
  expect(characterName(COBBLER, "cs")).toBe(cobbler.name);
  expect(characterName(COBBLER, "en")).toBe("Cobbler");
  expect(roleIcon(COBBLER)).toBe(`/botc/roles/hb/${COBBLER}.webp`);
  const fabled = homebrewList.roles.find((r) => r.team === "fabled")!;
  expect(findStorytellerRole(fabled.id)).toMatchObject({ team: "fabled", en: fabled.en });

  // the library and the draft read the wiki's script; homebrew brings the Bootlegger
  const parsed = parseScriptFile(JSON.stringify(LUIS_SCRIPT));
  if (!parsed.ok) throw new Error(parsed.error);
  expect(parsed.script.roleIds).toContain(COBBLER);
  expect(parsed.script.extras).toEqual([]);
  expect(parsed.script.fabled).toEqual(["bootlegger"]);
  expect(roleIdsFromScriptJson(JSON.stringify(LUIS_SCRIPT))).toContain(COBBLER);
  const luisTownsfolk = homebrewRoles.filter((r) => r.collection === "luis" && r.team === "townsfolk").map((r) => r.id);
  expect(resolveRoleSource({ kind: "filter", editions: [], collections: ["luis"], teams: ["townsfolk"] }).sort()).toEqual([...luisTownsfolk].sort());

  // the grimoire gets only the homebrew it asks for, with its night order and reminder tokens
  const homebrew = homebrewGrimoireCharacters([COBBLER, "imp", null], "cs");
  expect(Object.keys(homebrew)).toEqual([COBBLER]);
  expect(homebrew[COBBLER]).toMatchObject({ firstNight: data[COBBLER].firstNight, ability: cobbler.ability });
  expect(homebrewGrimoireCharacters([COBBLER], "en")[COBBLER].ability).toBe(data[COBBLER].ability);
  // the tokens' meaning comes from the English text, also of the Czech token
  const [drunkId, drunkData] = Object.entries(data).find(([id, c]) => c.reminders.includes("Drunk") && czech[id])!;
  const drunkCs = czech[drunkId].reminders[drunkData.reminders.indexOf("Drunk")];
  expect(homebrewGrimoireCharacters([drunkId], "en")[drunkId].tokenKinds.Drunk).toBe("drunk");
  expect(homebrewGrimoireCharacters([drunkId], "cs")[drunkId].tokenKinds[drunkCs]).toBe("drunk");

  // the first night wakes the Cobbler where its number puts it among the official characters
  const characters = { ...grimoireCharacters("cs"), ...homebrew };
  const roles = ["washerwoman", "chef", "empath", "poisoner", "imp", COBBLER];
  const state = { ...newGrimoireState({ id: null, name: "Luisův večer", roleIds: roles }, roles.map((r) => newSeat(r))), phase: "night" as const, round: 1 };
  state.seats = state.seats.map((s, i) => ({ ...s, role: roles[i] }));
  const order = nightSteps(state, characters, true).flatMap((s) => (s.roleId ? [s.roleId] : []));
  expect(order).toContain(COBBLER);
  const before = order.filter((id) => (characters[id]?.firstNight ?? 0) < data[COBBLER].firstNight);
  expect(order.slice(0, order.indexOf(COBBLER))).toEqual(expect.arrayContaining(before));
  expect(grimoireStateSchema.safeParse(state).success).toBe(true);

  // the script tool, the official app and clocktower.online get it in full, in Czech unless asked otherwise – also
  // instead of the wiki's own English entry; what the site does not know stays as it was
  const [full] = withHomebrewInFull([COBBLER]) as Record<string, unknown>[];
  expect(full).toMatchObject({ id: COBBLER, name: cobbler.name, team: "townsfolk", ability: cobbler.ability, firstNight: data[COBBLER].firstNight });
  expect(withHomebrewInFull([wikiEntry(COBBLER)], "en")[0]).toMatchObject({ id: COBBLER, name: "Cobbler", ability: data[COBBLER].ability });
  const unknown = { id: "hrdina_x", name: "Homebrew Hrdina", team: "townsfolk", ability: "Každou noc…" };
  expect(withHomebrewInFull([unknown, "washerwoman"])).toEqual([unknown, "washerwoman"]);
});

/** A session with players signed up and Luis's evening in the library and among its scripts */
async function sessionWithLuis(names: string[]) {
  const id = await createSession({ title: "Homebrew večer", capacity: 20 });
  await sql("update sessions set scripts = $1 where id = $2", [JSON.stringify([{ name: "Luisův večer", url: "https://example.com/luis" }]), id]);
  // stored before the site knew the Cobbler: its characters are read from the file again
  await sql("insert into scripts (name, json, role_ids) values ($1, $2, $3)", [
    "Luisův večer",
    JSON.stringify(LUIS_SCRIPT),
    JSON.stringify(["washerwoman", "chef", "empath", "poisoner", "imp"]),
  ]);
  for (const [i, name] of names.entries()) {
    await sql("insert into registrations (session_id, nickname, email, edit_token) values ($1, $2, $3, $4)", [id, name, `p${i}@example.com`, `hb-${i}`]);
  }
  return id;
}

const seat = (page: Page, name: string) => page.locator(`[data-testid=seat][data-seat="${name}"]`);

test("homebrew in the grimoire: the Cobbler in the bag, its ability and its first-night step, the Bootlegger, the game record", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const sessionId = await sessionWithLuis(["Ada", "Bára", "Cyril", "Dan", "Eva"]);
  await adminLogin(page);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await expect(page.getByTestId("seat")).toHaveCount(5);

  await page.getByTestId("setup-button").click();
  await page.getByTestId("setup-screen").getByRole("button", { name: "🎒 Výběr žetonů" }).click();
  const tokens = page.getByTestId("bag-screen");
  for (const name of [cobbler.name, "Pradlena", "Kuchař", "Travič", "Čert"]) await tokens.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  await tokens.getByRole("button", { name: "Hotovo", exact: true }).click();
  await page.getByTestId("setup-screen").getByRole("button", { name: "Rozdat náhodně" }).click();
  await page.getByTestId("ask-yes").click();
  await page.getByTestId("setup-screen").getByRole("button", { name: "Hotovo", exact: true }).click();

  const stored = async () => {
    const [row] = await sql<{ state: { seats: { name: string; role: string | null }[]; fabled?: string[] } }>("select state from grimoires order by id desc limit 1");
    return row.state;
  };
  await expect.poll(async () => (await stored()).seats.every((x) => x.role)).toBe(true);
  const st = await stored();
  // the script's homebrew brought the Bootlegger into the game
  expect(st.fabled).toEqual(["bootlegger"]);
  const cobblerPlayer = st.seats.find((x) => x.role === COBBLER)!.name;

  // the Cobbler's ability at its player, its step on the first night with the wiki's text
  await seat(page, cobblerPlayer).click();
  await expect(page.getByTestId("seat-panel")).toContainText(cobbler.ability);
  await expect(seat(page, cobblerPlayer).locator("img")).toHaveAttribute("src", `/botc/roles/hb/${COBBLER}.webp`);
  await page.getByRole("tab", { name: "1. noc" }).click();
  const step = page.getByTestId("night-panel").locator(`[data-step=${COBBLER}]`);
  await step.locator("button").nth(0).click();
  await expect(step).toContainText(cobbler.firstNightReminder);

  // the game record has the Cobbler, and the session's page shows it with its icon
  await page.getByTestId("game-button").click();
  const dialog = page.getByTestId("game-panel");
  await dialog.getByRole("button", { name: "😇 Dobro" }).click();
  await dialog.getByRole("button", { name: "Ukončit hru" }).click();
  await expect.poll(() => sql("select role from game_players where role = $1", [COBBLER])).toHaveLength(1);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  const games = page.locator("main ol").filter({ hasText: "Luisův večer" });
  await expect(games).toContainText(cobbler.name);
  await expect(games.locator(`img[src="/botc/roles/hb/${COBBLER}.webp"]`)).toHaveCount(1);
});

test("homebrew in the library, the catalogue, a draft and a game record: a collection's characters like the official ones", async ({ page }) => {
  await adminLogin(page);

  // a wiki script: its homebrew are characters, not extras; the script tool gets the file as it was
  await page.goto("/admin/botc/scripty");
  const form = page.getByTestId("library-script-form");
  await form.locator("#json").fill(JSON.stringify(LUIS_SCRIPT));
  await form.locator("button[type=submit]").click();
  await page.waitForURL(/\/admin\/botc\/scripty\/\d+$/);
  await expect(page.locator("main")).toContainText("Luis S · 6 postav");
  await expect(page.locator("#characters")).toContainText(cobbler.name);
  await expect(page.locator("#characters")).not.toContainText("Navíc ve scriptu");
  const toolHref = await page.getByRole("link", { name: "Otevřít ve script toolu" }).getAttribute("href");
  expect(scriptOfLink(toolHref!)).toEqual(withHomebrewInFull(LUIS_SCRIPT));
  expect(scriptOfLink(toolHref!).at(-1)).toMatchObject({ id: COBBLER, name: cobbler.name, ability: cobbler.ability });

  // the catalogue: every collection, a collection as a script's file with all its characters in full
  await page.goto("/admin/botc/scripty");
  await page.getByRole("link", { name: "🧪 Homebrew postavy →" }).click();
  await expect(page.locator("h1")).toHaveText("Homebrew postavy");
  await expect(page.getByTestId("homebrew-collections").locator("li[data-collection]")).toHaveCount(homebrewList.collections.length);
  const luis = page.locator("li[data-collection=luis]");
  await expect(luis).toContainText("Homebrews by Luis");
  await luis.locator("summary").click();
  await expect(luis).toContainText(cobbler.ability);
  // the Czech name, the English one next to it
  await expect(luis).toContainText(cobbler.name);
  await expect(luis.locator("span[lang=en]", { hasText: /^Cobbler$/ })).toBeVisible();
  const file = await page.request.get("/admin/botc/scripty/homebrew/luis/script.json");
  const collection = (await file.json()) as { id: string }[];
  expect(collection[0]).toMatchObject({ id: "_meta", name: "Homebrews by Luis", author: "Luis S" });
  expect(collection.length - 1).toBe(homebrewList.roles.filter((r) => r.c === "luis").length);
  expect(collection).toContainEqual(expect.objectContaining({ id: COBBLER, name: cobbler.name, ability: cobbler.ability }));

  // a draft offering Luis's collection only
  await page.goto("/admin/botc/drafty");
  await page.click("text=+ Nový draft");
  await page.fill("#name", "Luisův draft");
  for (const edition of await page.locator("input[name=edition]").all()) await edition.uncheck();
  await page.click("summary:has-text('Homebrew kolekce')");
  await page.getByRole("checkbox", { name: /Homebrews by Luis/ }).check();
  const offered = homebrewRoles.filter((r) => r.collection === "luis" && r.team !== "traveller").length;
  await expect(page.getByTestId("offered-count")).toHaveText(`Nabízí se ${offered} postav.`);
  await page.click("button:has-text('Vytvořit draft')");
  await expect(page.getByTestId("start-checks")).toContainText(`✅Nabídka: ${offered} postav`);
  const [draft] = await sql<{ role_source: unknown }>("select role_source from drafts");
  expect(draft.role_source).toEqual({ kind: "filter", editions: [], collections: ["luis"], teams: ["townsfolk", "outsider", "minion", "demon"] });

  // a game of a script the library does not have: the collection's characters in the selects
  const sessionId = await createSession({ title: "Úterý", capacity: 5 });
  const [reg] = await sql<{ id: number }>("insert into registrations (session_id, nickname, email, edit_token) values ($1, 'Ada', 'ada@example.com', 'hb-ada') returning id", [sessionId]);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.locator("input[name=scriptName][placeholder='Trouble Brewing']").fill("Ručně psaný homebrew");
  await page.locator("#homebrew").selectOption("luis");
  await page.click("summary:has-text('Kdo co hrál')");
  await page.locator(`select[name="role:${reg.id}"]`).selectOption(COBBLER);
  await page.getByRole("button", { name: "Přidat hru" }).click();
  await expect(page.locator("main ol").filter({ hasText: "Ručně psaný homebrew" })).toContainText(cobbler.name);
  expect(await sql("select role from game_players where registration_id = $1", [reg.id])).toEqual([{ role: COBBLER }]);
});
