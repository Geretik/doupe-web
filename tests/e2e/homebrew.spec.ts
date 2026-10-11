import { gunzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";
import homebrewList from "../../src/data/homebrew-roles.json";
import homebrewData from "../../src/data/homebrew-characters.json";
import homebrewCs from "../../src/data/homebrew-cs.json";
import { characterName, findRole, findStorytellerRole, homebrewRoles, matchHomebrew, nameInRecord, roleIcon } from "../../src/modules/botc/lib/botc-roles";
import { resolveRoleSource, roleIdsFromScriptJson } from "../../src/modules/botc/lib/draft/roles";
import { grimoireCharacters, withScriptNames } from "../../src/modules/botc/lib/grimoire/characters";
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

test("script builder: a new script from official, Fabled and homebrew characters found by name; its characters changed later, the rest of its file kept", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/botc/scripty");
  await page.getByRole("link", { name: "🧩 Sestavit script z postav →" }).click();
  await expect(page.locator("h1")).toHaveText("Sestavit script");
  const builder = page.getByTestId("script-builder");
  await expect(builder.locator("#author")).toHaveValue("Správce");

  // found by the Czech or the English name, homebrew with its ability
  const search = builder.locator("#builder-search");
  const tick = async (query: string, name: string) => {
    await search.fill(query);
    await builder.getByRole("checkbox", { name, exact: true }).check();
  };
  await tick("pradl", "Pradlena");
  await tick("čert", "Čert");
  await tick("džin", "Džin");
  await search.fill("cobbler");
  // another collection has a Cobbler too: the collection tells them apart
  const luis = builder.locator("[data-collection=luis]");
  await expect(luis).toContainText(cobbler.ability);
  await luis.getByRole("checkbox", { name: cobbler.name, exact: true }).check();
  await search.fill("nic takového tu není");
  await expect(builder).toContainText("Hledání neodpovídá žádná postava.");
  await search.fill("");

  // what is picked, by team; taken back with ✕
  const picked = builder.getByTestId("builder-picked");
  await expect(picked).toContainText("Vybrané postavy: 4 postavy");
  await tick("kuchař", "Kuchař");
  await picked.getByRole("button", { name: "Odebrat: Kuchař" }).click();
  await expect(picked).not.toContainText("Kuchař");

  await builder.locator("#name").fill("Ševcův večer");
  await builder.getByRole("button", { name: "Uložit do knihovny" }).click();
  await page.waitForURL(/\/admin\/botc\/scripty\/\d+$/);
  await expect(page.locator("h1")).toHaveText("Ševcův večer");
  for (const name of ["Pradlena", "Čert", cobbler.name]) await expect(page.locator("#characters")).toContainText(name);
  const id = Number(page.url().split("/").pop());
  const [row] = await sql<{ json: string; role_ids: string[]; author: string }>("select json, role_ids, author from scripts where id = $1", [id]);
  expect(row.author).toBe("Správce");
  // the players' characters in the usual order (by team, then by the English name), then the Fabled; by id
  expect(JSON.parse(row.json)).toEqual([{ id: "_meta", name: "Ševcův večer", author: "Správce" }, COBBLER, "washerwoman", "imp", "djinn"]);
  expect([...row.role_ids].sort()).toEqual(["imp", COBBLER, "washerwoman"].sort());
  // the tools get the homebrew character in full
  const file = (await (await page.request.get(`/admin/botc/scripty/${id}/script.json`)).json()) as unknown[];
  expect(file).toContainEqual(expect.objectContaining({ id: COBBLER, name: cobbler.name, ability: cobbler.ability }));
  expect(file).toContain("djinn");

  // a script from a file: its own rules and a character the site does not know stay when its characters change
  const unknown = { id: "hrdina_x", name: "Homebrew Hrdina", team: "townsfolk", ability: "Každou noc…" };
  const [own] = await sql<{ id: number }>("insert into scripts (name, json, role_ids) values ($1, $2, $3) returning id", [
    "Vlastní pravidla",
    JSON.stringify([{ id: "_meta", name: "Vlastní pravidla", logo: "https://example.com/logo.png", bootlegger: ["Nikdo nesmí šeptat."] }, "washerwoman", unknown]),
    JSON.stringify(["washerwoman"]),
  ]);
  await page.goto(`/admin/botc/scripty/${own.id}`);
  await page.getByRole("link", { name: "🧩 Upravit postavy" }).click();
  await expect(page.locator("h1")).toHaveText("Postavy scriptu Vlastní pravidla");
  await expect(builder.getByRole("checkbox", { name: "Pradlena", exact: true })).toBeChecked();
  await tick("kuchař", "Kuchař");
  await builder.getByRole("button", { name: "Uložit do knihovny" }).click();
  await page.waitForURL(new RegExp(`/admin/botc/scripty/${own.id}$`));
  await expect(page.locator("#characters")).toContainText("Kuchař");
  const [changed] = await sql<{ json: string }>("select json from scripts where id = $1", [own.id]);
  expect(JSON.parse(changed.json)).toEqual([
    { id: "_meta", name: "Vlastní pravidla", logo: "https://example.com/logo.png", bootlegger: ["Nikdo nesmí šeptat."] },
    "chef",
    "washerwoman",
    unknown,
  ]);
  await page.goto("/admin/historie");
  await expect(page.getByTestId("log-entry").nth(0)).toContainText("nové postavy");
});

test("script names: a themed script renames characters – in the texts where the name stands as it is, at the Djinn's jinxes, in the records with the own name", async ({ page }) => {
  // the texts: the name as it stands, not its declined forms; the jinxes (English) too
  const cs = withScriptNames(grimoireCharacters("cs"), { imp: "Krampus", boffin: "Profík" }, "cs");
  expect(cs.imp.otherNightReminder).toMatch(/^Krampus vybere 1 hráče\. Pokud Krampus vybere sám sebe/);
  expect(cs.imp.otherNightReminder).toContain("žetonem Čerta");
  expect(cs.imp.ability).toContain("stane Čertem");
  expect(cs.alchemist.jinxes.boffin).toBe("If the Alchemist has the Profík ability, the Alchemist does not learn what ability the Demon has.");
  expect(nameInRecord("imp", "cs", { imp: "Krampus" })).toBe("Krampus (Čert)");
  expect(nameInRecord("imp", "cs", null)).toBe("Čert");

  // the builder: a name for this script only
  await adminLogin(page);
  await page.goto("/admin/botc/scripty/novy");
  const builder = page.getByTestId("script-builder");
  for (const [query, name] of [["pradl", "Pradlena"], ["kuch", "Kuchař"], ["empat", "Empat"], ["travič", "Travič"], ["čert", "Čert"]]) {
    await builder.locator("#builder-search").fill(query);
    await builder.getByRole("checkbox", { name, exact: true }).check();
  }
  await builder.getByTestId("builder-rename").locator("summary").click();
  await builder.getByLabel("Jméno ve scriptu: Čert").fill("Krampus");
  await expect(builder.getByTestId("builder-picked")).toContainText("Krampus");
  await builder.locator("#name").fill("Vánoční večer");
  await builder.getByRole("button", { name: "Uložit do knihovny" }).click();
  await page.waitForURL(/\/admin\/botc\/scripty\/\d+$/);
  await expect(page.locator("#characters")).toContainText("Krampus (Čert)");
  const id = Number(page.url().split("/").pop());
  expect(await sql("select names from scripts where id = $1", [id])).toEqual([{ names: { imp: "Krampus" } }]);
  await page.getByRole("link", { name: "🧩 Upravit postavy" }).click();
  await expect(builder.getByLabel("Jméno ve scriptu: Čert")).toHaveValue("Krampus");

  // a game of it: the grimoire says Krampus, the record "Krampus (Čert)"
  const sessionId = await createSession({ title: "Vánoční večer", capacity: 10 });
  await sql("update sessions set scripts = $1 where id = $2", [JSON.stringify([{ name: "Vánoční večer", url: `https://www.doupeol.cz/botc/script/${id}` }]), sessionId]);
  for (const [i, nick] of ["Ada", "Bára", "Cyril", "Dan", "Eva"].entries()) {
    await sql("insert into registrations (session_id, nickname, email, edit_token) values ($1, $2, $3, $4)", [sessionId, nick, `v${i}@example.com`, `vn-${i}`]);
  }
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await page.getByTestId("setup-button").click();
  await page.getByTestId("setup-screen").getByRole("button", { name: "🎒 Výběr žetonů" }).click();
  const tokens = page.getByTestId("bag-screen");
  for (const name of ["Krampus", "Pradlena", "Kuchař", "Empat", "Travič"]) await tokens.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  await tokens.getByRole("button", { name: "Hotovo", exact: true }).click();
  await page.getByTestId("setup-screen").getByRole("button", { name: "Rozdat náhodně" }).click();
  await page.getByTestId("ask-yes").click();
  await page.getByTestId("setup-screen").getByRole("button", { name: "Hotovo", exact: true }).click();
  await expect.poll(async () => (await sql<{ state: { seats: { role: string | null }[] } }>("select state from grimoires"))[0].state.seats.every((s) => s.role)).toBe(true);
  const [{ state }] = await sql<{ state: { seats: { name: string; role: string }[]; script: { names?: Record<string, string> } } }>("select state from grimoires");
  expect(state.script.names).toEqual({ imp: "Krampus" });
  const krampus = state.seats.find((s) => s.role === "imp")!.name;
  await page.locator(`[data-testid=seat][data-seat="${krampus}"]`).click();
  await expect(page.getByTestId("seat-panel")).toContainText("Krampus");
  await page.getByTestId("game-button").click();
  await page.getByTestId("game-panel").getByRole("button", { name: "😈 Zlo" }).click();
  await page.getByTestId("game-panel").getByRole("button", { name: "Ukončit hru" }).click();
  await expect.poll(() => sql("select names from games where session_id = $1", [sessionId])).toEqual([{ names: { imp: "Krampus" } }]);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await expect(page.locator("main ol").filter({ hasText: "Vánoční večer" })).toContainText("Krampus (Čert)");

  // a game recorded in the form takes the names of the library's script of its name
  const [reg] = await sql<{ id: number }>("select id from registrations where session_id = $1 and nickname = 'Ada'", [sessionId]);
  const form = page.locator("form").filter({ has: page.locator("#homebrew") }).last();
  await form.locator("#scriptPick").selectOption("Vánoční večer");
  await form.locator("summary:has-text('Kdo co hrál')").click();
  await form.locator(`select[name="role:${reg.id}"]`).selectOption("imp");
  await form.getByRole("button", { name: "Přidat hru" }).click();
  await expect.poll(() => sql("select names from games where session_id = $1 order by id", [sessionId])).toEqual([{ names: { imp: "Krampus" } }, { names: { imp: "Krampus" } }]);
});
