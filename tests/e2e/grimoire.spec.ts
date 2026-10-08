import { expect, test, type Locator, type Page } from "@playwright/test";
import { grimoireCharacters, jinxesAmong } from "../../src/modules/botc/lib/grimoire/characters";
import {
  bluffCandidates,
  changeRole,
  diedLately,
  dealBag,
  demonHeirs,
  demonToMinion,
  diedToday,
  evilDead,
  evilLivingNeighbours,
  evilPairs,
  expectedSetup,
  impairment,
  lineUpTyphon,
  nearestEvilWay,
  newGrimoireState,
  newSeat,
  nextPhase as next,
  nightSteps,
  noDashiiPoisoned,
  poCharged,
  putToken,
  randomBag,
  registersAs,
  registersDead,
  remainingBag,
  remindersOf,
  setDead,
  shownAs,
  starPass,
  tapBag,
  toggleReminder,
  typhonInLine,
  vortoxWorks,
  withScript,
  type GrimoireState,
} from "../../src/modules/botc/lib/grimoire/state";
import { grimoireStateSchema } from "../../src/modules/botc/lib/grimoire/schema";
import { findRole, roleName } from "../../src/modules/botc/lib/botc-roles";
import { stepCards, youAreCard } from "../../src/modules/botc/lib/grimoire/show";
import { adminLogin, createAdminUser, createSession, resetDb, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
});

const TROUBLE_BREWING = [
  "washerwoman", "librarian", "investigator", "chef", "empath", "fortuneteller", "undertaker", "monk", "ravenkeeper",
  "virgin", "slayer", "soldier", "mayor", "butler", "drunk", "recluse", "saint", "poisoner", "spy", "scarletwoman", "baron", "imp",
];

/** A session with players signed up and Trouble Brewing among its scripts (the library has it). */
async function sessionWithPlayers(names: string[]) {
  const id = await createSession({ title: "Úterní Krvavka", capacity: 20 });
  await sql("update sessions set scripts = $1 where id = $2", [JSON.stringify([{ name: "Trouble Brewing", url: "https://example.com/tb" }]), id]);
  await sql("insert into scripts (name, json, role_ids) values ($1, $2, $3)", [
    "Trouble Brewing",
    JSON.stringify([{ id: "_meta", name: "Trouble Brewing" }, ...TROUBLE_BREWING]),
    JSON.stringify(TROUBLE_BREWING),
  ]);
  for (const [i, name] of names.entries()) {
    await sql("insert into registrations (session_id, nickname, email, edit_token) values ($1, $2, $3, $4)", [id, name, `p${i}@example.com`, `grim-${i}`]);
  }
  return id;
}

const seat = (page: Page, name: string) => page.locator(`[data-testid=seat][data-seat="${name}"]`);

/** The setup over the whole screen, from the button under the grimoire's panel. */
async function openSetup(page: Page) {
  await page.getByTestId("setup-button").click();
  return page.getByTestId("setup-screen");
}
const closeSetup = (page: Page) => page.getByTestId("setup-screen").getByRole("button", { name: "Hotovo", exact: true }).click();

/** The token selection over the whole screen, from the setup: tokens into the bag, the Demon's bluffs. */
async function openTokens(page: Page) {
  await page.getByTestId("setup-screen").getByRole("button", { name: "🎒 Výběr žetonů" }).click();
  return page.getByTestId("bag-screen");
}
const closeTokens = (page: Page) => page.getByTestId("bag-screen").getByRole("button", { name: "Hotovo", exact: true }).click();

/** Deals the bag at random from the bottom of the setup, saying yes to "really at random?". */
async function dealAtRandom(page: Page) {
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("setup-screen").getByRole("button", { name: "Rozdat náhodně" }).click();
}

/** Ends the game in the dialog of the button under the grimoire's panel; the dialog stays open with the result. */
async function endTheGame(page: Page, winner: "😇 Dobro" | "😈 Zlo" | "Nevím", notes?: string) {
  await page.getByTestId("game-button").click();
  const dialog = page.getByTestId("game-panel");
  await dialog.getByRole("button", { name: winner }).click();
  if (notes) await dialog.getByLabel("Poznámka ke hře").fill(notes);
  await dialog.getByRole("button", { name: "Ukončit hru" }).click();
  return dialog;
}

/** The stored grimoire, once the page's autosave has caught up with what the test expects. */
async function stored<T>(
  pick: (state: { seats: { name: string; role: string | null; reminders: { text: string }[] }[]; phase: string; seatsLocked?: boolean }) => T,
  expected: T,
) {
  await expect
    .poll(async () => {
      const [row] = await sql<{ state: Parameters<typeof pick>[0] }>("select state from grimoires order by id desc limit 1");
      return row ? pick(row.state) : null;
    })
    .toEqual(expected);
}

// ─── pure logic ──────────────────────────────────────────────────────────────

const characters = grimoireCharacters("cs");
const nextPhase = (state: GrimoireState) => next(state, characters);

/** A game in its `round`-th night with these characters, one player each (named after the character) */
function nightOf(roles: string[], round = 2): GrimoireState {
  const seats = roles.map((role) => ({ ...newSeat(role), role }));
  return { ...newGrimoireState({ id: null, name: "Test", roleIds: roles }, seats), phase: "night", round };
}
const at = (state: GrimoireState, role: string) => state.seats.find((s) => s.name === role)!;

test("night rules: the Demon's attack kills unless the Monk, Soldier or Fool keeps the player alive", () => {
  let state = nightOf(["imp", "poisoner", "monk", "soldier", "fool", "chef", "empath"]);
  const attack = (role: string) => (state = putToken(state, at(state, role).id, "imp", "Mrtvý", characters));
  state = putToken(state, at(state, "chef").id, "monk", "Chráněný", characters);
  attack("chef");
  attack("soldier");
  expect([at(state, "chef").dead, at(state, "soldier").dead]).toEqual([false, false]);
  // the Fool lives through the first death and uses up his ability
  attack("fool");
  expect(at(state, "fool")).toMatchObject({ dead: false, reminders: [{ text: "Mrtvý" }, { roleId: "fool", text: "Bez schopnosti" }] });
  attack("empath");
  expect(at(state, "empath").dead).toBe(true);
  // a poisoned Soldier dies; the Monk's token outside the night does not matter: the token is no attack before the game
  state = putToken(state, at(state, "soldier").id, "poisoner", "Otrávený", characters);
  attack("soldier");
  expect(at(state, "soldier").dead).toBe(true);
  const before = { ...nightOf(["imp", "chef"]), phase: "setup" as const };
  expect(at(putToken(before, at(before, "chef").id, "imp", "Mrtvý", characters), "chef").dead).toBe(false);
});

test("night rules: the Pukka's poison moved on kills the player poisoned before, unless protected", () => {
  let state = nightOf(["pukka", "monk", "chef", "empath", "soldier", "mayor"], 1);
  const poison = (role: string) => (state = putToken(state, at(state, role).id, "pukka", "Otrávený", characters));
  const dead = () => state.seats.filter((s) => s.dead).map((s) => s.name);
  const night = () => (state = nextPhase(nextPhase(state)));
  poison("chef");
  expect(dead()).toEqual([]);
  night();
  poison("empath");
  expect(dead()).toEqual(["chef"]);
  expect(at(state, "chef").reminders.map((r) => r.text)).toEqual(["Mrtvý"]); // dead, and healthy again
  // the wrong player tapped and put right: the poison of tonight kills nobody
  poison("mayor");
  expect(dead()).toEqual(["chef"]);
  night();
  state = putToken(state, at(state, "mayor").id, "monk", "Chráněný", characters);
  poison("soldier");
  expect(at(state, "mayor").dead).toBe(false);
  night();
  poison("empath");
  expect(dead()).toEqual(["chef"]); // the Soldier is safe from the Demon
});

test("night rules: an Imp who kills themself passes to the Scarlet Woman first, else the Storyteller picks a Minion", () => {
  const passed = (roles: string[], change = (s: GrimoireState) => s) => {
    const state = change(nightOf(roles));
    const after = putToken(state, at(state, "imp").id, "imp", "Mrtvý", characters);
    return { state, after, pass: starPass(after, characters) };
  };
  const five = ["imp", "scarletwoman", "poisoner", "baron", "chef"];
  // 5 players alive with the Imp: the Scarlet Woman becomes the Imp, with her "Demon" token
  const { after, pass } = passed(five);
  expect(at(after, "imp").dead).toBe(true);
  expect(at(after, "scarletwoman")).toMatchObject({ role: "imp", reminders: [{ roleId: "scarletwoman", text: "Démon" }] });
  expect(pass?.heir?.name).toBe("scarletwoman");
  // 4 alive, or the Scarlet Woman poisoned: her ability does not work, any living Minion may become the Imp
  const four = passed(five, (s) => ({ ...s, seats: s.seats.map((x) => (x.role === "chef" ? { ...x, dead: true } : x)) }));
  expect(four.pass).toMatchObject({ heir: null });
  expect(four.pass?.choices.map((s) => s.name)).toEqual(["scarletwoman", "poisoner", "baron"]);
  const poisoned = passed(five, (s) => putToken(s, at(s, "scarletwoman").id, "poisoner", "Otrávený", characters));
  expect(demonHeirs(poisoned.state, at(poisoned.state, "imp").id, characters, true).map((s) => s.name)).toEqual(["scarletwoman", "poisoner", "baron"]);
  // the only living Minion becomes the Imp; none left, nobody does
  expect(at(passed(["imp", "poisoner", "chef", "monk", "empath"]).after, "poisoner").role).toBe("imp");
  expect(passed(["imp", "chef", "monk", "empath", "soldier"]).pass).toEqual({ heir: null, choices: [] });
});

test("night rules: a Minion executed with the Minstrel makes everyone else drunk until dusk tomorrow", () => {
  let state: GrimoireState = { ...nightOf(["minstrel", "poisoner", "imp", "chef", "monk"], 1), phase: "day" };
  const drunk = () => state.seats.map((s) => impairment(state, s, characters));
  state = setDead(state, at(state, "chef").id, true, characters);
  expect(drunk()).toEqual([null, null, null, null, null]); // a good player's execution
  state = setDead(state, at(state, "poisoner").id, true, characters);
  expect(drunk()).toEqual([null, "minstrel", "minstrel", "minstrel", "minstrel"]);
  state = nextPhase(state); // night 2
  expect(drunk()[4]).toBe("minstrel");
  // the Monk's protection does not work drunk
  state = putToken(state, at(state, "monk").id, "monk", "Chráněný", characters);
  state = putToken(state, at(state, "monk").id, "imp", "Mrtvý", characters);
  expect(at(state, "monk").dead).toBe(true);
  state = nextPhase(nextPhase(state)); // day 2, then dusk: sober again
  expect(drunk()).toEqual([null, null, null, null, null]);
});

test("night rules: tokens only for the character's own player", () => {
  expect(characters.scarletwoman.selfTokens).toEqual(["Démon"]);
  expect(characters.seamstress.selfTokens).toEqual(["Bez schopnosti"]);
  expect(characters.po.selfTokens).toEqual(["3 útoky"]);
  expect(characters.poisoner.selfTokens).toEqual([]);
});

const dead = (state: GrimoireState) => state.seats.filter((s) => s.dead).map((s) => s.name);
const names = (seats: { name: string }[]) => seats.map((s) => s.name);

test("night rules: the Spy and the Recluse may register otherwise for each piece of information: every number and character it may be", () => {
  // imp | recluse | chef | spy | poisoner | empath, round the circle: by the characters one evil pair (Spy & Poisoner)
  const state = nightOf(["imp", "recluse", "chef", "spy", "poisoner", "empath"], 1);
  const chef = evilPairs(state, characters);
  expect([chef.n, chef.values, names(chef.by)]).toEqual([1, [0, 1, 2], ["recluse", "spy"]]);
  // the Empath between the Poisoner and the Imp: no doubt
  expect(evilLivingNeighbours(state, at(state, "empath").id, characters)).toMatchObject({ n: 2, values: [2], by: [] });
  // between the Recluse and the Spy, each may count or not; a dead Spy still may, a poisoned Recluse may not
  const between = nightOf(["recluse", "empath", "spy", "imp", "washerwoman"], 1);
  const empath = (s: GrimoireState) => evilLivingNeighbours(s, at(s, "empath").id, characters);
  expect(empath(between)).toMatchObject({ n: 1, values: [0, 1, 2] });
  const poisoned = putToken(between, at(between, "recluse").id, "poisoner", "Otrávený", characters);
  expect(empath(poisoned)).toMatchObject({ n: 1, values: [0, 1] });
  const deadSpy = { ...between, seats: between.seats.map((s) => (s.name === "spy" ? { ...s, dead: true } : s)) };
  expect(evilPairs(deadSpy, characters)).toMatchObject({ n: 1, values: [0, 1] }); // the Spy & Imp pair
  // the Washerwoman's Spy may be any Townsfolk of the script; the Investigator's Recluse any Minion, the Spy just the Spy
  expect(registersAs(between, at(between, "spy"), "townsfolk", characters)).toEqual(["empath", "washerwoman"]);
  expect(registersAs(between, at(between, "recluse"), "minion", characters)).toEqual(["spy"]);
  expect(registersAs(between, at(between, "spy"), "minion", characters)).toEqual(["spy"]);
  expect(registersAs(between, at(between, "recluse"), "outsider", characters)).toEqual(["recluse"]);
});

test("night rules: the Demon dying by day passes to the Scarlet Woman, who wakes that night to learn it; taken back the same day, it never happened", () => {
  let state: GrimoireState = { ...nightOf(["imp", "scarletwoman", "poisoner", "chef", "monk"], 1), phase: "day" };
  state = setDead(state, at(state, "imp").id, true, characters);
  expect(at(state, "scarletwoman")).toMatchObject({ role: "imp", reminders: [{ roleId: "scarletwoman", text: "Démon" }] });
  // the wrong player tapped: back to life, the Scarlet Woman is herself again and the log is empty
  state = setDead(state, at(state, "imp").id, false, characters);
  expect(at(state, "scarletwoman")).toMatchObject({ role: "scarletwoman", reminders: [] });
  expect(state.log).toEqual([]);
  state = nextPhase(setDead(state, at(state, "imp").id, true, characters));
  expect(nightSteps(state, characters, false).find((s) => s.id === "scarletwoman")?.seatIds).toEqual([at(state, "scarletwoman").id]);
  // with 4 alive she stays the Scarlet Woman
  const four: GrimoireState = { ...nightOf(["imp", "scarletwoman", "poisoner", "chef"], 1), phase: "day" };
  expect(at(setDead(four, at(four, "imp").id, true, characters), "scarletwoman").role).toBe("scarletwoman");
});

test("night rules: the Zombuul's first death only registers, a day with a death means no kill, the second death is real", () => {
  let state: GrimoireState = { ...nightOf(["zombuul", "scarletwoman", "poisoner", "chef", "monk", "empath"], 1), phase: "day" };
  state = setDead(state, at(state, "zombuul").id, true, characters);
  expect(registersDead(state, at(state, "zombuul"))).toBe(true);
  expect(at(state, "scarletwoman").role).toBe("scarletwoman");
  state = nextPhase(state); // night 2: someone died today
  expect(diedToday(state).map((e) => e.name)).toEqual(["zombuul"]);
  expect(nightSteps(state, characters, false).find((s) => s.id === "zombuul")?.seatIds).toEqual([at(state, "zombuul").id]);
  state = nextPhase(state); // day 2: executed again – now for real, and the Scarlet Woman becomes the Zombuul
  state = setDead(state, at(state, "zombuul").id, true, characters);
  expect(registersDead(state, at(state, "zombuul"))).toBe(false);
  expect(at(state, "scarletwoman").role).toBe("zombuul");
  expect(diedToday(nextPhase(nextPhase(nextPhase(state))))).toEqual([]); // night 4: nobody died on day 3
  // poisoned, the Zombuul dies the first time
  let poisoned: GrimoireState = { ...nightOf(["zombuul", "poisoner", "chef", "monk", "empath"], 1), phase: "day" };
  poisoned = putToken(poisoned, at(poisoned, "zombuul").id, "poisoner", "Otrávený", characters);
  poisoned = setDead(poisoned, at(poisoned, "zombuul").id, true, characters);
  expect(registersDead(poisoned, at(poisoned, "zombuul"))).toBe(false);
});

test("night rules: the Shabaloth kills two a night and may regurgitate one of them the next", () => {
  let state = nightOf(["shabaloth", "chef", "empath", "monk", "mayor", "soldier"]);
  const attack = (role: string) => (state = putToken(state, at(state, role).id, "shabaloth", "Mrtvý", characters));
  attack("chef");
  attack("empath");
  expect(dead(state)).toEqual(["chef", "empath"]);
  state = nextPhase(nextPhase(state));
  state = putToken(state, at(state, "chef").id, "shabaloth", "Živý", characters);
  expect(dead(state)).toEqual(["empath"]);
  // tonight's two take last night's tokens
  attack("monk");
  attack("mayor");
  expect(dead(state)).toEqual(["empath", "monk", "mayor"]);
  expect(state.seats.filter((s) => s.reminders.some((r) => r.text === "Mrtvý")).map((s) => s.name)).toEqual(["monk", "mayor"]);
});

test("night rules: the Po who chose nobody chooses three players the next night", () => {
  let state = nightOf(["po", "chef", "empath", "monk", "mayor", "soldier", "butler"]);
  state = toggleReminder(state, at(state, "po").id, "po", "3 útoky");
  expect(poCharged(state, characters)).toBe(false);
  state = nextPhase(nextPhase(state)); // night 3
  expect(poCharged(state, characters)).toBe(true);
  for (const role of ["chef", "empath", "mayor"]) state = putToken(state, at(state, role).id, "po", "Mrtvý", characters);
  expect(dead(state)).toEqual(["chef", "empath", "mayor"]);
  state = nextPhase(state); // dawn: the three attacks are made
  expect(at(state, "po").reminders).toEqual([]);
  state = nextPhase(state); // night 4: one again
  expect(poCharged(state, characters)).toBe(false);
  for (const role of ["monk", "butler"]) state = putToken(state, at(state, role).id, "po", "Mrtvý", characters);
  expect(state.seats.filter((s) => s.reminders.some((r) => r.text === "Mrtvý")).map((s) => s.name)).toEqual(["butler"]);
});

test("night rules: the Fang Gu's first Outsider becomes the Fang Gu and the Fang Gu dies instead", () => {
  let state = nightOf(["fanggu", "scarletwoman", "butler", "saint", "chef", "monk"]);
  state = putToken(state, at(state, "butler").id, "fanggu", "Mrtvý", characters);
  expect(at(state, "butler")).toMatchObject({ role: "fanggu", dead: false, reminders: [{ roleId: "fanggu", text: "Once" }] });
  expect(at(state, "fanggu")).toMatchObject({ dead: true, reminders: [{ roleId: "fanggu", text: "Mrtvý" }] });
  expect(at(state, "scarletwoman").role).toBe("scarletwoman"); // a Demon lives on
  state = nextPhase(nextPhase(state));
  state = putToken(state, at(state, "saint").id, "fanggu", "Mrtvý", characters);
  expect(at(state, "saint")).toMatchObject({ role: "saint", dead: true });
});

test("night rules: a Minion the Vigormortis kills keeps their ability and poisons their Townsfolk neighbour", () => {
  let state = nightOf(["vigormortis", "chef", "poisoner", "butler", "empath", "monk"]);
  state = putToken(state, at(state, "poisoner").id, "vigormortis", "Mrtvý", characters);
  expect(at(state, "poisoner")).toMatchObject({ dead: true, reminders: [{ text: "Mrtvý" }, { text: "Has ability" }] });
  // the Chef is the only Townsfolk next to them (the Butler is an Outsider)
  expect(at(state, "chef").reminders.map((r) => r.text)).toEqual(["Poisoned"]);
  expect(impairment(state, at(state, "chef"), characters)).toBe("poisoned");
});

test("night rules: the No Dashii poisons the nearest Townsfolk either side; the Vortox makes the Townsfolk's information false", () => {
  // the Butler is no Townsfolk: past him, the Monk
  let state = nightOf(["nodashii", "butler", "monk", "chef", "poisoner", "empath"]);
  expect(noDashiiPoisoned(state, characters).map((id) => state.seats.find((s) => s.id === id)!.name).sort()).toEqual(["empath", "monk"]);
  expect(impairment(state, at(state, "chef"), characters)).toBe(null);
  // the poisoned Monk protects nobody
  state = putToken(state, at(state, "chef").id, "monk", "Chráněný", characters);
  state = putToken(state, at(state, "chef").id, "nodashii", "Mrtvý", characters);
  expect(at(state, "chef").dead).toBe(true);
  const vortox = nightOf(["vortox", "chef", "poisoner", "empath", "monk"]);
  expect(vortoxWorks(vortox, characters)).toBe(true);
  expect(vortoxWorks(putToken(vortox, at(vortox, "vortox").id, "poisoner", "Otrávený", characters), characters)).toBe(false);
});

test("night rules: the log keeps deaths, attacks lived through and new Demons; a Demon's token moved on takes its survivor out", () => {
  let state = nightOf(["imp", "scarletwoman", "poisoner", "monk", "chef", "soldier"]);
  const attack = (role: string) => (state = putToken(state, at(state, role).id, "imp", "Mrtvý", characters));
  state = putToken(state, at(state, "chef").id, "monk", "Chráněný", characters);
  attack("chef");
  attack("soldier");
  state = setDead(nextPhase(state), at(state, "imp").id, true, characters);
  const id = (role: string) => at(state, role).id;
  expect(state.log).toEqual([
    { round: 2, kind: "survived", seatId: id("soldier"), name: "soldier", role: "soldier", by: "soldier" },
    { round: 2, day: true, kind: "death", seatId: id("imp"), name: "imp", role: "imp" },
    { round: 2, day: true, kind: "became", seatId: id("scarletwoman"), name: "scarletwoman", role: "scarletwoman", by: "imp" },
  ]);
});

test("night rules: the Al-Hadikhia's chosen die choosing death, come back choosing life, and all die when all three chose life", () => {
  let state = nightOf(["alhadikhia", "chef", "empath", "monk", "mayor", "soldier"]);
  const choose = (role: string, choice: string) => (state = putToken(state, at(state, role).id, "alhadikhia", choice, characters));
  choose("chef", "Chose death");
  choose("empath", "Chose life");
  choose("mayor", "Chose life");
  expect(dead(state)).toEqual(["chef"]);
  state = nextPhase(nextPhase(state));
  // the dead Chef chooses life and lives; the Empath, chosen again, and the Monk too: all three die
  choose("chef", "Chose life");
  expect(dead(state)).toEqual([]);
  choose("empath", "Chose life");
  choose("monk", "Chose life");
  expect(dead(state)).toEqual(["chef", "empath", "monk"]);
});

test("night rules: the Lleech lives while its host lives and dies with them; taken back the same day, both live", () => {
  let state = nightOf(["lleech", "scarletwoman", "chef", "empath", "monk", "mayor"], 1);
  state = nextPhase(putToken(state, at(state, "chef").id, "lleech", "Poisoned", characters)); // day 1
  state = setDead(state, at(state, "lleech").id, true, characters);
  expect(dead(state)).toEqual([]);
  state = setDead(state, at(state, "chef").id, true, characters);
  expect(dead(state)).toEqual(["lleech", "chef"]);
  expect(at(state, "scarletwoman").role).toBe("lleech");
  state = setDead(state, at(state, "chef").id, false, characters);
  expect(dead(state)).toEqual([]);
  expect(at(state, "scarletwoman").role).toBe("scarletwoman");
  expect(state.log?.map((e) => e.kind)).toEqual(["survived"]);
});

test("night rules: on day 3 the Minions become Riot; the Leviathan's good players executed by day", () => {
  const riot = nightOf(["riot", "poisoner", "baron", "chef", "empath", "monk", "mayor"], 3);
  expect(nextPhase(nightOf(["riot", "poisoner", "chef", "empath", "monk"], 2)).seats.map((s) => s.role)).toEqual(["riot", "poisoner", "chef", "empath", "monk"]);
  const day3 = nextPhase(riot);
  expect(day3.seats.map((s) => s.role)).toEqual(["riot", "riot", "riot", "chef", "empath", "monk", "mayor"]);
  expect(day3.log?.map((e) => [e.kind, e.name, e.by])).toEqual([
    ["became", "poisoner", "riot"],
    ["became", "baron", "riot"],
  ]);
  let state: GrimoireState = { ...nightOf(["leviathan", "chef", "empath", "poisoner", "monk"]), phase: "day" };
  state = setDead(setDead(state, at(state, "chef").id, true, characters), at(state, "poisoner").id, true, characters);
  const executed = (s: GrimoireState) => s.seats.filter((x) => x.reminders.some((r) => r.text === "Good player executed")).map((x) => x.name);
  expect(executed(state)).toEqual(["chef"]); // the Poisoner is evil
  expect(executed(setDead(state, at(state, "chef").id, false, characters))).toEqual([]);
});

test("setup and night rules: Lil' Monsta goes to nobody – a Minion more, the Minions pick its babysitter, its Dead kills", () => {
  const roles = ["lilmonsta", "poisoner", "spy", "chef", "empath", "monk", "mayor", "soldier"];
  const bag = expectedSetup(7, roles, true)!;
  const seated = expectedSetup(7, roles)!;
  expect([bag.townsfolk.values, bag.minion.values, bag.demon.values]).toEqual([[5], [2], [1]]);
  expect(seated.demon.values).toEqual([0]);
  const seats = Array.from({ length: 7 }, (_, i) => newSeat(`p${i}`));
  const dealt = dealBag({ ...newGrimoireState({ id: null, name: "Test", roleIds: roles }, seats), bag: roles })!;
  expect(dealt.seats.map((s) => s.role).sort()).toEqual(roles.slice(1).sort());
  let state: GrimoireState = { ...dealt, phase: "night", round: 1 };
  const minions = state.seats.filter((s) => ["poisoner", "spy"].includes(s.role!)).map((s) => s.id);
  expect(nightSteps(state, characters, true).find((s) => s.id === "lilmonsta")?.seatIds.sort()).toEqual(minions.sort());
  state = nextPhase(nextPhase(state));
  const chef = state.seats.find((s) => s.role === "chef")!.id;
  state = putToken(state, chef, "lilmonsta", "Dead", characters);
  expect(state.seats.find((s) => s.id === chef)?.dead).toBe(true);
});

test("setup rules: Legion takes several tokens and registers as a Minion; the Lord of Typhon's evil sit in a line round it", () => {
  const legion = { ...nightOf(["legion", "legion", "legion", "chef", "empath"], 1), bag: ["legion", "legion", "legion", "chef", "empath"] };
  expect(registersAs(legion, legion.seats[0], "minion", characters)).toEqual(["legion"]);
  const drawing = { ...legion, seats: legion.seats.map((s, i) => (i === 0 ? s : { ...s, role: null })) };
  expect(remainingBag(drawing).sort()).toEqual(["chef", "empath", "legion", "legion"]);
  // one Legion dies, the others live on: nobody becomes the Demon
  expect(demonHeirs(legion, legion.seats[0].id, characters)).toEqual([]);

  const typhon = nightOf(["lordoftyphon", "chef", "poisoner", "empath", "spy", "monk", "mayor"], 1);
  expect(typhonInLine(typhon)).toBe(false);
  const lined = lineUpTyphon(typhon, () => 0);
  expect(lined.seats.map((s) => s.role)).toEqual(["lordoftyphon", "poisoner", "chef", "empath", "mayor", "monk", "spy"]);
  expect(typhonInLine(lined)).toBe(true);
  const roles = ["lordoftyphon", "poisoner", "spy", "chef", "empath", "monk", "mayor"];
  for (let i = 0; i < 10; i++) {
    const seats = Array.from({ length: 7 }, (_, k) => newSeat(`p${k}`));
    expect(typhonInLine(dealBag({ ...newGrimoireState({ id: null, name: "Test", roleIds: roles }, seats), bag: roles })!)).toBe(true);
  }
});

test("night rules: a character changed during the game is logged once, where it ended", () => {
  let state = nightOf(["kazali", "chef", "empath", "monk", "mayor"], 1);
  const chef = at(state, "chef").id;
  state = changeRole(changeRole(state, chef, "poisoner"), chef, "spy");
  expect(state.log?.map((e) => [e.kind, e.name, e.role, e.by])).toEqual([["became", "chef", "chef", "spy"]]);
  expect(changeRole(state, chef, "chef").log).toEqual([]);
  expect(changeRole({ ...state, phase: "setup", log: [] }, chef, "monk").log).toEqual([]);
});

test("night rules for Minions: tokens until dusk, the Godfather's and Assassin's kills, who cannot die by day", () => {
  // the Poisoner's poison lasts tonight and tomorrow day, the Organ Grinder's drunkenness until dusk; the Pukka's stays
  let state = nightOf(["poisoner", "organgrinder", "pukka", "chef", "empath", "monk"], 1);
  state = putToken(state, at(state, "chef").id, "poisoner", "Otrávený", characters);
  state = putToken(state, at(state, "organgrinder").id, "organgrinder", "Opilý", characters);
  state = putToken(state, at(state, "empath").id, "pukka", "Otrávený", characters);
  const impaired = (s: GrimoireState) => s.seats.filter((x) => impairment(s, x, characters)).map((x) => x.name);
  state = nextPhase(state); // day 1
  expect(impaired(state)).toEqual(["organgrinder", "chef", "empath"]);
  state = nextPhase(state); // dusk → night 2
  expect(impaired(state)).toEqual(["empath"]);

  // the Godfather's kill: the Monk and the Soldier keep safe only from the Demon, the Innkeeper and the Sailor from dying
  let night = nightOf(["godfather", "assassin", "monk", "innkeeper", "soldier", "sailor", "chef", "empath", "lleech", "mayor"]);
  night = putToken(night, at(night, "chef").id, "monk", "Chráněný", characters);
  night = putToken(night, at(night, "empath").id, "innkeeper", "Chráněný", characters);
  for (const role of ["chef", "empath", "soldier", "sailor"]) night = putToken(night, at(night, role).id, "godfather", "Mrtvý", characters);
  expect(dead(night)).toEqual(["soldier", "chef"].sort((a, b) => night.seats.findIndex((x) => x.name === a) - night.seats.findIndex((x) => x.name === b)));
  // the Assassin's kill gets through even to the Lleech whose host lives
  night = putToken(night, at(night, "mayor").id, "lleech", "Poisoned", characters);
  night = putToken(night, at(night, "lleech").id, "assassin", "Mrtvý", characters);
  expect(at(night, "lleech").dead).toBe(true);

  // by day the Vizier cannot die (and is no execution for the Minstrel), nor the Devil's Advocate's player
  let day: GrimoireState = { ...nightOf(["vizier", "devilsadvocate", "minstrel", "chef", "empath", "imp"]), phase: "night" };
  day = nextPhase(putToken(day, at(day, "chef").id, "devilsadvocate", "Survives execution", characters));
  day = setDead(setDead(day, at(day, "vizier").id, true, characters), at(day, "chef").id, true, characters);
  expect(dead(day)).toEqual([]);
  expect(impaired(day)).toEqual([]);
  day = setDead(day, at(day, "empath").id, true, characters);
  expect(dead(day)).toEqual(["empath"]);
});

test("night rules for Minions: the Mezepheles turns a player evil, the Xaan poisons the Townsfolk on night X, the Boffin's ability wakes the Demon", () => {
  // the Washerwoman turned evil between the Imp and the Mezepheles: two evil pairs for the Chef
  let state = nightOf(["imp", "washerwoman", "mezepheles", "chef", "empath"]);
  expect(evilPairs(state, characters).n).toBe(0);
  state = putToken(state, at(state, "washerwoman").id, "mezepheles", "Turns evil", characters);
  expect(evilPairs(state, characters).n).toBe(2);
  // two Outsiders: night 2 and day 2 every Townsfolk is poisoned
  const xaan = (round: number) => nightOf(["xaan", "butler", "saint", "chef", "empath", "imp"], round);
  const poisoned = (s: GrimoireState) => s.seats.filter((x) => impairment(s, x, characters)).map((x) => x.name);
  expect(poisoned(xaan(1))).toEqual([]);
  expect(poisoned(xaan(2))).toEqual(["chef", "empath"]);
  expect(poisoned(nextPhase(xaan(2)))).toEqual(["chef", "empath"]);
  expect(poisoned(xaan(3))).toEqual([]);
  // the Boffin gives the Imp the Monk's ability: it wakes at the Monk's step
  const boffin = nightOf(["imp", "boffin", "chef", "empath", "mayor"]);
  const given = { ...boffin, seats: boffin.seats.map((x) => (x.role === "boffin" ? { ...x, believedRole: "monk" } : x)) };
  expect(nightSteps(given, characters, false).find((x) => x.id === "monk")?.seatIds).toEqual([at(given, "imp").id]);
});

test("night rules for Outsiders: every Dead of a character who is no Demon kills, the Moonchild's only the good", () => {
  let state = nightOf(["moonchild", "tinker", "gossip", "monk", "innkeeper", "chef", "empath", "poisoner", "mayor"]);
  state = putToken(state, at(state, "poisoner").id, "moonchild", "Mrtvý", characters); // evil: nothing
  expect(dead(state)).toEqual([]);
  state = putToken(state, at(state, "mayor").id, "moonchild", "Mrtvý", characters);
  state = putToken(state, at(state, "tinker").id, "tinker", "Mrtvý", characters);
  // the Gossip's kill: the Monk protects only from the Demon, the Innkeeper from dying at all
  state = putToken(state, at(state, "chef").id, "monk", "Chráněný", characters);
  state = putToken(state, at(state, "empath").id, "innkeeper", "Chráněný", characters);
  state = putToken(state, at(state, "chef").id, "gossip", "Mrtvý", characters);
  state = putToken(state, at(state, "empath").id, "gossip", "Mrtvý", characters);
  expect(dead(state)).toEqual(["tinker", "chef", "mayor"]);
  // who died last night or today: the Moonchild and the Klutz learn it
  const day = nextPhase(state);
  expect(diedLately(day).map((e) => e.name)).toEqual(["mayor", "tinker", "chef"]);
  expect(diedLately(nextPhase(day))).toHaveLength(0);
});

test("night rules for Outsiders: the Goon's first chooser is drunk until dusk, the Ogre's side, the Hermit's abilities, the Lunatic's own step", () => {
  let state = nightOf(["goon", "poisoner", "imp", "monk", "chef", "empath"]);
  state = putToken(state, at(state, "goon").id, "poisoner", "Otrávený", characters);
  expect(at(state, "poisoner").reminders.map((r) => [r.roleId, r.text])).toEqual([["goon", "Opilý"]]);
  expect(impairment(state, at(state, "goon"), characters)).toBe(null);
  // the second chooser tonight is no Goon's business: the Imp kills it
  state = putToken(state, at(state, "goon").id, "imp", "Mrtvý", characters);
  expect(dead(state)).toEqual(["goon"]);
  expect(at(nextPhase(nextPhase(state)), "poisoner").reminders).toEqual([]);
  // the Imp chooses the Goon first: the Imp is drunk, the Goon lives
  let first = nightOf(["goon", "imp", "monk", "chef", "empath"]);
  first = putToken(first, at(first, "goon").id, "imp", "Mrtvý", characters);
  expect([dead(first), at(first, "imp").reminders.map((r) => r.text)]).toEqual([[], ["Opilý"]]);

  // the Ogre took the Imp's side: an evil pair for the Chef
  let ogre = nightOf(["ogre", "imp", "chef", "empath", "monk"], 1);
  expect(evilPairs(ogre, characters).n).toBe(0);
  ogre = putToken(ogre, at(ogre, "imp").id, "ogre", "Friend", characters);
  expect(evilPairs(ogre, characters).n).toBe(1);

  // the Hermit has the script's Outsider abilities: the Butler's step, the Recluse's registering
  const hermit = { ...nightOf(["hermit", "imp", "chef", "empath", "monk"]), script: { id: null, name: "Test", roleIds: ["hermit", "butler", "recluse", "imp", "chef", "empath", "monk"] } };
  expect(nightSteps(hermit, characters, false).find((x) => x.id === "butler")?.seatIds).toEqual([at(hermit, "hermit").id]);
  expect(evilPairs(hermit, characters).values).toEqual([0, 1]);

  // the Lunatic thinking they are the Imp wakes at their own step, not the Imp's
  const lunatic = nightOf(["imp", "lunatic", "chef", "empath", "monk"]);
  const acting = { ...lunatic, seats: lunatic.seats.map((x) => (x.role === "lunatic" ? { ...x, believedRole: "imp" } : x)) };
  const steps = nightSteps(acting, characters, false);
  expect([steps.find((x) => x.id === "imp")?.seatIds, steps.find((x) => x.id === "lunatic")?.seatIds]).toEqual([[at(acting, "imp").id], [at(acting, "lunatic").id]]);
});

test("night rules for Townsfolk: the Sailor, the Fool and the Tea Lady's neighbours do not die, also by day; the Grandmother dies with her grandchild", () => {
  let day: GrimoireState = { ...nightOf(["sailor", "fool", "imp", "chef", "empath", "monk"]), phase: "day" };
  day = setDead(setDead(day, at(day, "sailor").id, true, characters), at(day, "fool").id, true, characters);
  expect(dead(day)).toEqual([]);
  expect(at(day, "fool").reminders.map((r) => r.text)).toEqual(["Bez schopnosti"]);
  day = setDead(day, at(day, "fool").id, true, characters); // the second time the Fool dies
  expect(dead(day)).toEqual(["fool"]);
  // the Sailor drunk by their own choice dies
  day = setDead(putToken(day, at(day, "sailor").id, "sailor", "Opilý", characters), at(day, "sailor").id, true, characters);
  expect(dead(day)).toEqual(["sailor", "fool"]);

  // the Tea Lady between the Chef and the Empath: neither dies; next to the Imp, nobody is safe
  let tea = nightOf(["chef", "tealady", "empath", "monk", "imp", "mayor"]);
  tea = putToken(tea, at(tea, "chef").id, "imp", "Mrtvý", characters);
  tea = setDead({ ...tea, phase: "day" }, at(tea, "empath").id, true, characters);
  expect(dead(tea)).toEqual([]);
  const evilNeighbour = nightOf(["imp", "tealady", "empath", "monk", "chef"]);
  expect(dead(putToken(evilNeighbour, at(evilNeighbour, "empath").id, "imp", "Mrtvý", characters))).toEqual(["empath"]);

  // the Imp kills the Grandmother's grandchild: she dies too
  let grandmother = nightOf(["imp", "grandmother", "chef", "empath", "monk"]);
  grandmother = putToken(grandmother, at(grandmother, "chef").id, "grandmother", "Grandchild", characters);
  expect(dead(putToken(grandmother, at(grandmother, "chef").id, "imp", "Mrtvý", characters))).toEqual(["grandmother", "chef"]);
});

test("night rules for Townsfolk: the Philosopher's character drunk, the Preacher's Minion, the Courtier's 3 days, the Snake Charmer's swap, the Cannibal's meal", () => {
  const philosopher = nightOf(["philosopher", "chef", "empath", "imp", "monk"]);
  const chose = { ...philosopher, seats: philosopher.seats.map((x) => (x.role === "philosopher" ? { ...x, believedRole: "chef" } : x)) };
  expect(impairment(chose, at(chose, "chef"), characters)).toBe("drunk");
  let preached = nightOf(["preacher", "poisoner", "imp", "chef", "monk"]);
  preached = putToken(preached, at(preached, "poisoner").id, "preacher", "At a sermon", characters);
  expect(impairment(preached, at(preached, "poisoner"), characters)).toBe("sermon");

  // the Courtier's chosen character is drunk for 3 nights and 3 days
  let courtier = nightOf(["courtier", "poisoner", "imp", "chef", "monk"], 1);
  courtier = putToken(courtier, at(courtier, "poisoner").id, "courtier", "Opilý 3", characters);
  const drunk = (s: GrimoireState) => impairment(s, at(s, "poisoner"), characters);
  for (let i = 0; i < 5; i++) {
    courtier = nextPhase(courtier);
    expect(drunk(courtier)).toBe("drunk"); // day 1 … day 3
  }
  expect(drunk(nextPhase(courtier))).toBe(null); // night 4

  // the Snake Charmer's poison on the Imp: they swap, the old Imp is the poisoned Snake Charmer
  let charmer = nightOf(["snakecharmer", "imp", "chef", "empath", "monk"]);
  charmer = putToken(charmer, at(charmer, "imp").id, "snakecharmer", "Poisoned", characters);
  expect(charmer.seats.map((x) => x.role)).toEqual(["imp", "snakecharmer", "chef", "empath", "monk"]);
  expect(impairment(charmer, charmer.seats[1], characters)).toBe("poisoned");

  // the Cannibal has the last executee's ability: the Monk's step; after an evil one, poisoned
  let cannibal: GrimoireState = { ...nightOf(["cannibal", "monk", "poisoner", "imp", "chef"], 1), phase: "day" };
  cannibal = nextPhase(setDead(cannibal, at(cannibal, "monk").id, true, characters));
  expect(nightSteps(cannibal, characters, false).find((x) => x.id === "monk")?.seatIds).toEqual([at(cannibal, "cannibal").id, at(cannibal, "monk").id]);
  expect(impairment(cannibal, at(cannibal, "cannibal"), characters)).toBe(null);
  cannibal = nextPhase(setDead(nextPhase(cannibal), at(cannibal, "poisoner").id, true, characters));
  expect(impairment(cannibal, at(cannibal, "cannibal"), characters)).toBe("poisoned");

  // the Alchemist has a Minion's ability: the Poisoner's step
  const alchemist = nightOf(["alchemist", "imp", "chef", "empath", "monk"]);
  const poisoning = { ...alchemist, seats: alchemist.seats.map((x) => (x.role === "alchemist" ? { ...x, believedRole: "poisoner" } : x)) };
  expect(nightSteps(poisoning, characters, false).find((x) => x.id === "poisoner")?.seatIds).toEqual([at(poisoning, "alchemist").id]);
});

test("night rules for Townsfolk: the Clockmaker's, Oracle's and Shugenja's information and the Undertaker's executee, with every value the Spy and Recluse allow", () => {
  // imp | chef | poisoner: two steps; the Recluse next to the Imp may make it one
  const clock = nightOf(["imp", "chef", "poisoner", "empath", "monk"], 1);
  expect(demonToMinion(clock, characters)).toMatchObject({ n: 2, values: [2] });
  const recluse = nightOf(["imp", "recluse", "chef", "poisoner", "empath", "monk"], 1);
  expect(demonToMinion(recluse, characters)).toMatchObject({ n: 3, values: [1, 2, 3] });

  const oracle = { ...nightOf(["imp", "poisoner", "spy", "chef", "empath", "monk"]), seats: [] as GrimoireState["seats"] };
  oracle.seats = nightOf(["imp", "poisoner", "spy", "chef", "empath", "monk"]).seats.map((x) => (["poisoner", "spy", "chef"].includes(x.name) ? { ...x, dead: true } : x));
  expect(evilDead(oracle, characters)).toMatchObject({ n: 2, values: [1, 2] });

  // the Shugenja: the Imp two clockwise, the Poisoner three anti-clockwise; a Recluse right next to her anti-clockwise
  const shugenja = nightOf(["shugenja", "chef", "imp", "empath", "poisoner", "monk", "mayor"]);
  expect(nearestEvilWay(shugenja, at(shugenja, "shugenja").id, characters)).toMatchObject({ n: "clockwise", values: ["clockwise"] });
  const doubt = nightOf(["shugenja", "chef", "imp", "empath", "poisoner", "monk", "recluse"]);
  expect(nearestEvilWay(doubt, at(doubt, "shugenja").id, characters).values.sort()).toEqual(["anticlockwise", "clockwise"]);

  // the Undertaker's executed Spy may be shown as any Townsfolk or Outsider of the script
  const undertaker = nightOf(["undertaker", "spy", "imp", "butler", "chef"]);
  expect(shownAs(undertaker, at(undertaker, "spy"), characters)).toEqual(["spy", "undertaker", "butler", "chef"]);
});

test("show the player: the Minions their Demon and each other, the Demon its Minions and bluffs, a working Magician among both; You are as the player thinks", () => {
  let state = nightOf(["imp", "poisoner", "spy", "magician", "drunk", "chef", "washerwoman"], 1);
  state = { ...state, bluffs: ["monk", "soldier", "mayor"], seats: state.seats.map((s) => (s.role === "drunk" ? { ...s, believedRole: "empath" } : s)) };
  const id = (role: string) => at(state, role).id;
  const cards = (stepId: string, s = state) => stepCards(s, nightSteps(s, characters, true).find((x) => x.id === stepId)!, characters).map((x) => x.card.lines);
  // in the circle's order; the Magician is a Demon to the Minions and a Minion to the Demon
  expect(cards("minionInfo")).toEqual([
    [
      { title: "thisIsDemon", roles: [], seatIds: [id("imp"), id("magician")] },
      { title: "yourMinions", roles: [], seatIds: [id("poisoner"), id("spy"), id("magician")] },
    ],
  ]);
  expect(cards("demonInfo")).toEqual([
    [
      { title: "yourMinions", roles: [], seatIds: [id("poisoner"), id("spy"), id("magician")] },
      { title: "notInPlay", roles: ["monk", "soldier", "mayor"], seatIds: [] },
    ],
  ]);
  // the Drunk is shown the Townsfolk they think they are, and wakes as the Empath: nobody evil next to them
  expect(youAreCard(state, at(state, "drunk"), characters).lines).toEqual([{ title: "youAre", roles: ["empath"], seatIds: [], side: "good" }]);
  expect(cards("empath")).toEqual([[{ title: null, roles: [], seatIds: [], number: 0 }]]);
  // the Chef: the Imp and the Poisoner, the Poisoner and the Spy
  expect(cards("chef")).toEqual([[{ title: null, roles: [], seatIds: [], number: 2 }]]);
  // the Washerwoman: the character under her first token, both players in the circle's order
  expect(cards("washerwoman")).toEqual([[{ title: "oneOfThem", roles: [], seatIds: [] }]]);
  state = putToken(state, id("chef"), "washerwoman", "Měšťan", characters);
  state = putToken(state, id("imp"), "washerwoman", "Někdo jiný", characters);
  expect(cards("washerwoman")).toEqual([[{ title: "oneOfThem", roles: ["chef"], seatIds: [id("imp"), id("chef")] }]]);
  // a poisoned Magician is no Demon to anybody; a Mezepheles's word makes a player evil, the Marionette is not told
  state = putToken(state, id("magician"), "poisoner", "Otrávený", characters);
  expect(cards("minionInfo")[0][0].seatIds).toEqual([id("imp")]);
  const turned = putToken(state, id("chef"), "mezepheles", "Turns evil", characters);
  expect(youAreCard(turned, at(turned, "chef"), characters).lines[0]).toMatchObject({ roles: ["chef"], side: "evil" });
  const marionette = { ...at(state, "chef"), role: "marionette", believedRole: "chef" };
  expect(youAreCard(state, marionette, characters).lines[0]).toMatchObject({ roles: ["chef"], side: "good" });

  // a working Poppy Grower: the Minions learn nothing, the Demon only the bluffs
  const poppy = { ...nightOf(["imp", "poisoner", "poppygrower", "chef", "empath", "monk", "mayor"], 1), bluffs: ["soldier", null, "virgin"] };
  expect(cards("minionInfo", poppy)).toEqual([]);
  expect(cards("demonInfo", poppy)).toEqual([[{ title: "notInPlay", roles: ["soldier", "virgin"], seatIds: [] }]]);
});

test("jinxes: pairs of characters with a jinx, whichever of the two lists it", () => {
  const reason = "If the Spy is (or has been) in play, the Damsel is poisoned.";
  expect(jinxesAmong(["spy", "damsel", "chef"], characters)).toEqual([{ a: "spy", b: "damsel", reason }]);
  expect(jinxesAmong(["damsel", null, "spy"], characters)).toEqual([{ a: "damsel", b: "spy", reason }]);
  expect(jinxesAmong(["chef", "empath"], characters)).toEqual([]);
});

test("Fabled and Loric: the script's in a new game and after another script, the Sentinel's Outsider, the evil's info under 7 players only with the Toymaker, their night steps", () => {
  const fresh = newGrimoireState({ id: 1, name: "A", roleIds: ["chef", "imp"], fabled: ["djinn"] }, []);
  expect(fresh.fabled).toEqual(["djinn"]);
  // another script: the old one's Fabled make way for the new one's, the ones added for the table stay
  const other = withScript({ ...fresh, fabled: ["djinn", "spiritofivory"] }, { id: 2, name: "B", roleIds: ["chef"], fabled: ["bootlegger"] });
  expect(other.fabled).toEqual(["spiritofivory", "bootlegger"]);
  // stored with their tokens and deeds; an unknown one is refused
  const saved = { ...nightOf(["imp", "chef"]), fabled: ["stormcatcher"] };
  const caught = putToken(saved, at(saved, "chef").id, "stormcatcher", "Chycen bouří", characters);
  expect(grimoireStateSchema.safeParse({ ...caught, log: [{ round: 2, kind: "survived", seatId: "x", name: "A", role: "chef", by: "stormcatcher" }] }).success).toBe(true);
  expect(grimoireStateSchema.safeParse({ ...saved, fabled: ["chef"] }).success).toBe(false);

  // 8 players have 1 Outsider; with the Sentinel 0 to 2
  expect(expectedSetup(8, ["imp", "sentinel"])!.outsider).toEqual({ base: 1, values: [0, 1, 2], by: ["sentinel"] });

  // 6 players: no Minion or Demon info, unless the Toymaker gives the evil their starting info
  const ids = (state: GrimoireState, first = true) => nightSteps(state, characters, first).map((x) => x.id);
  const six = nightOf(["imp", "poisoner", "chef", "empath", "monk", "saint"], 1);
  expect(ids(six)).not.toContain("minionInfo");
  expect(ids(six)).not.toContain("demonInfo");
  expect(ids(nightOf(["imp", "poisoner", "chef", "empath", "monk", "saint", "mayor"], 1))).toContain("minionInfo");
  const toymaker = { ...six, fabled: ["toymaker", "angel", "buddhist", "spiritofivory"] };
  // the Fabled who act at night, right after dusk; the Spirit of Ivory never wakes
  expect(ids(toymaker).slice(0, 4)).toEqual(["dusk", "angel", "buddhist", "toymaker"]);
  expect(ids(toymaker)).toContain("minionInfo");
  expect(ids(toymaker)).toContain("demonInfo");
  expect(ids(toymaker)).not.toContain("spiritofivory");
  expect(ids({ ...toymaker, round: 2 }, false).filter((id) => ["toymaker", "angel", "buddhist"].includes(id))).toEqual(["toymaker"]);
});

test("Fabled and Loric: the Storm Catcher's player only dies by execution and the evil learn who it is; the Duchess's visitors learn how many of them are evil", () => {
  let state: GrimoireState = { ...nightOf(["imp", "poisoner", "chef", "empath", "monk", "saint", "mayor"], 1), fabled: ["stormcatcher"] };
  const id = (role: string) => at(state, role).id;
  const storm = () => nightSteps(state, characters, true).find((x) => x.id === "stormcatcher")!;
  const cards = () => stepCards(state, storm(), characters).map((x) => x.card.lines);
  // the evil players wake; the character it named is not in play, or this player is it
  expect(storm().seatIds).toEqual([id("imp"), id("poisoner")]);
  expect(cards()).toEqual([[{ title: "notInPlay", roles: [], seatIds: [] }]]);
  state = putToken(state, id("chef"), "stormcatcher", "Chycen bouří", characters);
  expect(cards()).toEqual([[{ title: "thisPlayerIs", roles: ["chef"], seatIds: [id("chef")] }]]);
  // the Demon's attack does not kill them; executed by day they die
  state = putToken({ ...state, round: 2 }, id("chef"), "imp", "Mrtvý", characters);
  expect(at(state, "chef").dead).toBe(false);
  expect(state.log?.at(-1)).toMatchObject({ kind: "survived", by: "stormcatcher" });
  state = setDead(nextPhase(state), id("chef"), true, characters);
  expect(at(state, "chef").dead).toBe(true);

  // the visitors of the day: two Visitors and one with False Info
  let duchess: GrimoireState = { ...nightOf(["imp", "poisoner", "chef", "empath", "monk", "saint", "mayor"], 1), phase: "day", fabled: ["duchess"] };
  const visit = (role: string, text: string) => (duchess = putToken(duchess, at(duchess, role).id, "duchess", text, characters));
  visit("imp", "Návštěvník");
  visit("chef", "Návštěvník");
  visit("empath", "Falešná informace");
  expect(remindersOf(duchess, "duchess")).toHaveLength(3);
  duchess = nextPhase(duchess);
  const step = nightSteps(duchess, characters, false).find((x) => x.id === "duchess")!;
  expect(step.seatIds).toEqual([at(duchess, "imp").id, at(duchess, "chef").id, at(duchess, "empath").id]);
  const told = (number: number | null) => [
    { title: "selectedYou", roles: ["duchess"], seatIds: [] },
    { title: null, roles: [], seatIds: [], number },
  ];
  // one of them is evil; the one with false information gets a number the Storyteller picks
  expect(stepCards(duchess, step, characters).map((x) => x.card.lines)).toEqual([told(1), told(1), told(null)]);
  // at dawn the visits are over
  expect(remindersOf(nextPhase(duchess), "duchess")).toEqual([]);
});

test("Fabled and Loric: the Pope's duplicate good characters – twice in the bag, at random too, both woken; bluffs among the characters in play", () => {
  const seats = Array.from({ length: 7 }, (_, i) => newSeat(`P${i}`));
  let state: GrimoireState = { ...newGrimoireState({ id: null, name: "TB", roleIds: TROUBLE_BREWING }, seats), fabled: ["pope"] };
  // a second tap puts a good character in twice, a third takes it out; never an evil one or the Drunk
  state = tapBag(tapBag(state, "empath"), "empath");
  expect(state.bag).toEqual(["empath", "empath"]);
  expect(tapBag(state, "empath").bag).toEqual([]);
  expect(tapBag(tapBag(state, "imp"), "imp").bag).toEqual(["empath", "empath"]);
  expect(tapBag(tapBag(state, "drunk"), "drunk").bag).toEqual(["empath", "empath"]);
  // without the Pope the second tap takes it out
  expect(tapBag({ ...state, fabled: [] }, "empath").bag).toEqual([]);

  // at random: a Townsfolk twice
  const townsfolk = (bag: string[]) => bag.filter((id) => findRole(id)?.team === "townsfolk");
  for (let i = 0; i < 20; i++) {
    const bag = randomBag(state)!;
    expect(new Set(townsfolk(bag)).size).toBe(townsfolk(bag).length - 1);
  }
  const plain = randomBag({ ...state, fabled: [] })!;
  expect(new Set(townsfolk(plain)).size).toBe(townsfolk(plain).length);

  // dealt: two Empaths wake at its step, each learns their own number
  const dealt = dealBag({ ...state, bag: ["empath", "empath", "chef", "washerwoman", "monk", "poisoner", "imp"] })!;
  const empaths = nightSteps(dealt, characters, true).find((x) => x.id === "empath")!;
  expect(empaths.seatIds).toHaveLength(2);
  expect(stepCards(dealt, empaths, characters)).toHaveLength(2);
  // the Demon may be shown a character in play
  expect(bluffCandidates(dealt)).toContain("empath");
  expect(bluffCandidates({ ...dealt, fabled: [] })).not.toContain("empath");
});

test("grimoire: from a session, hand out the bag, the first night, a death and a reminder, the game into the session's games", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 }); // a tablet on its side
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva", "Filip", "Gita"]);
  await adminLogin(page);

  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await expect(page).toHaveURL(/\/admin\/botc\/grimoary\/\d+$/);
  await expect(page.locator("h1")).toHaveText("Úterní Krvavka");
  await expect(page.getByTestId("seat")).toHaveCount(7);
  await expect(page.getByTestId("phase")).toHaveText("Příprava");
  // the session's script, found in the library by its name
  await openSetup(page);
  await expect(page.locator("#grimoire-script option:checked")).toHaveText("Trouble Brewing");
  await expect(page.getByTestId("distribution")).toContainText("Rozložení pro 7 hráčů");

  // five Townsfolk, a Minion and the Demon chosen into the bag; the setup only shows them, and the bluffs
  const tokens = await openTokens(page);
  for (const name of ["Pradlena", "Empat", "Mnich", "Strážkyně krkavců", "Panna", "Travič", "Čert"]) {
    await tokens.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  }
  await tokens.getByTestId("bag-bluffs").getByRole("button", { name: "Blafy Démona 1" }).click();
  await tokens.getByRole("button", { name: "Blafy Démona: Vědma" }).click();
  await expect(tokens.getByRole("button", { name: "Rozdat náhodně" })).toHaveCount(0);
  await closeTokens(page);
  await expect(page.getByTestId("setup-screen")).toContainText("Pytlík: 7 z 7");
  await expect(page.getByTestId("bag-contents")).toContainText("Strážkyně krkavců");
  await expect(page.getByTestId("bag-contents").getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("bluffs-view")).toHaveText("Vědma");

  // handed out at random, after saying that it should be random
  page.once("dialog", (d) => d.dismiss());
  await page.getByTestId("setup-screen").getByRole("button", { name: "Rozdat náhodně" }).click();
  await expect(page.getByTestId("town")).toContainText("bez postavy");
  await dealAtRandom(page);
  await expect(page.getByTestId("town")).not.toContainText("bez postavy");
  // Ada becomes the Drunk below, so the Poisoner and the Demon must be someone else's: deal again until they are
  for (let i = 0; i < 30 && /Travič|Čert/.test((await seat(page, "Ada").textContent()) ?? ""); i++) {
    await dealAtRandom(page);
    await expect(page.getByTestId("town")).not.toContainText("bez postavy");
  }
  await expect(seat(page, "Ada")).not.toContainText(/Travič|Čert/);
  await expect(page.locator("[data-testid=distribution] tbody tr").first()).toContainText("Měšťané555");
  await closeSetup(page);

  // Ada is the Drunk who thinks she is the Chef
  await seat(page, "Ada").click();
  const panel = page.getByTestId("seat-panel");
  await panel.getByRole("button", { name: "Změnit" }).click();
  await panel.getByRole("button", { name: "Postava: Opilec" }).click();
  await panel.getByRole("button", { name: "Vybrat" }).click();
  await panel.getByRole("button", { name: "Myslí si, že je: Kuchař" }).click();
  await expect(seat(page, "Ada")).toContainText("Opilec");

  // the player let go of: ✕ in the panel, or a second tap on them
  await page.getByTestId("deselect").click();
  await expect(panel).toHaveCount(0);
  await seat(page, "Ada").click();
  await expect(panel).toBeVisible();
  await seat(page, "Ada").click();
  await expect(panel).toHaveCount(0);

  // the game starts right from the setup
  const setup = await openSetup(page);

  // the first night: only the steps of the characters in play, the Drunk under the Chef
  await setup.getByRole("button", { name: "Začít hru → 1. noc" }).click();
  await expect(setup).toHaveCount(0);
  await expect(page.getByTestId("phase")).toHaveText("1. noc");
  const night = page.getByTestId("night-panel");
  await expect(night.locator("[data-step=dusk]")).toBeVisible();
  await expect(night.locator("[data-step=minionInfo]")).toBeVisible();
  await expect(night.locator("[data-step=poisoner]")).toBeVisible();
  await expect(night.locator("[data-step=chef]")).toContainText("Ada (Opilec)");
  await expect(night.locator("[data-step=monk]")).toHaveCount(0); // the Monk does not wake on the first night
  await expect(night.locator("[data-step=dusk]")).toContainText("Všichni hráči zavřou oči.");
  await night.getByRole("button", { name: "Hotovo ↓" }).click();
  await expect(night.locator("[data-step=minionInfo]")).toContainText("Pokud je ve hře 7 a více hráčů");

  // Bára dies and gets a reminder; undo takes the reminder back
  await seat(page, "Bára").click();
  await panel.getByRole("button", { name: "☠ Zemřel/a" }).click();
  await expect(page.getByTestId("town")).toContainText("Živí 6 z 7");
  await panel.getByRole("button", { name: "+ Připomínka" }).click();
  await panel.getByRole("button", { name: "Otrávený" }).click();
  await expect(page.getByTestId("reminder")).toHaveText("Otrávený");
  await page.getByRole("button", { name: "↶ Zpět" }).click();
  await expect(page.getByTestId("reminder")).toHaveCount(0);
  await panel.getByRole("button", { name: "+ Připomínka" }).click();
  await panel.getByRole("button", { name: "Otrávený" }).click();
  await stored((st) => st.seats.flatMap((x) => x.reminders.map((r) => r.text)), ["Otrávený"]);

  // everything is saved: a reload (or another tablet of the same Storyteller) shows the same grimoire
  await page.reload();
  await expect(page.getByTestId("phase")).toHaveText("1. noc");
  await expect(page.getByTestId("reminder")).toHaveText("Otrávený");
  await expect(seat(page, "Bára")).toHaveClass(/absolute/);
  await expect(page.getByTestId("town")).toContainText("Živí 6 z 7");

  await page.getByRole("button", { name: "Ráno → 1. den" }).click();
  await expect(page.getByTestId("phase")).toHaveText("1. den");
  await expect(page.getByTestId("town")).toContainText("K popravě 3 hlasů");

  // good wins, with a note: the game goes into the session's games played
  await endTheGame(page, "😇 Dobro", "Opilec to celé otočil.");
  await expect(page.getByTestId("recorded")).toBeVisible();
  await expect(page.getByTestId("game-button")).toHaveText("🏁 😇 Vyhrálo dobro");
  const games = await sql<{ script_name: string; script_url: string; winner: string; players: number; demon_bluffs: string[]; notes: string }>(
    "select script_name, script_url, winner, players, demon_bluffs, notes from games where session_id = $1",
    [sessionId],
  );
  expect(games).toHaveLength(1);
  expect(games[0]).toMatchObject({ script_name: "Trouble Brewing", winner: "good", players: 7, demon_bluffs: ["fortuneteller"], notes: "Opilec to celé otočil." });
  expect(games[0].script_url).toContain("?script=");
  const ada = await sql<{ role: string; believed_role: string }>(
    "select gp.role, gp.believed_role from game_players gp join registrations r on r.id = gp.registration_id where r.nickname = 'Ada'",
  );
  expect(ada).toEqual([{ role: "drunk", believed_role: "chef" }]);
  expect(await sql("select id from game_players")).toHaveLength(7);

  await page.getByTestId("recorded").click();
  await expect(page).toHaveURL(new RegExp(`/admin/botc/termin/${sessionId}#hry$`));
  await expect(page.locator("#hry")).toContainText("Trouble Brewing");
  await expect(page.locator("#hry")).toContainText("vyhrálo dobro");
  await expect(page.getByTestId("session-grimoires")).toContainText("Konec hry");

  // back into the game by mistake and out again: the same game record is updated, not a second one
  await page.goto(page.url().replace(/\/admin\/botc\/termin\/.*/, "") + (await page.getByTestId("session-grimoires").locator("a").first().getAttribute("href")));
  await page.getByTestId("game-button").click();
  await expect(page.getByTestId("game-panel")).toContainText("Opilec to celé otočil.");
  await page.getByRole("button", { name: "Vrátit se do hry" }).click();
  await endTheGame(page, "😈 Zlo");
  await expect.poll(() => sql("select winner, notes from games where session_id = $1", [sessionId])).toEqual([{ winner: "evil", notes: "Opilec to celé otočil." }]);

  // the next game: same players in the same seats, nothing else
  await page.getByRole("button", { name: "Další hra se stejnými hráči" }).click();
  await expect(page.locator("h1")).toHaveText("Úterní Krvavka – 2. hra");
  await expect(page.getByTestId("seat")).toHaveCount(7);
  await expect(page.getByTestId("town")).toContainText("bez postavy");
});

test("grimoire: an empty one, players typed in; only its Storyteller sees it until the game ends; a save from an older page is refused", async ({ page, browser }) => {
  await createAdminUser({ email: "druhy@example.com", password: "druhy-password-123", nickname: "Druhý", role: "organizer" });
  await adminLogin(page);
  await page.goto("/admin/botc/grimoary");
  await page.fill("#name", "Zkouška");
  await page.getByRole("button", { name: "Založit grimoár" }).click();
  await expect(page.locator("h1")).toHaveText("Zkouška");
  await openSetup(page);
  await expect(page.locator("#grimoire-script option:checked")).toHaveText("Všechny postavy");
  for (const name of ["Jana", "Petr"]) {
    await page.getByRole("textbox", { name: "Jméno hráče" }).fill(name);
    await page.getByRole("button", { name: "Přidat", exact: true }).click();
  }
  await expect(page.getByTestId("seat")).toHaveCount(2);
  await stored((st) => st.seats.length, 2);
  const url = page.url();

  // another account: not while the game runs
  const ctx = await browser.newContext({ locale: "cs-CZ" });
  const other = await ctx.newPage();
  await adminLogin(other, { email: "druhy@example.com", password: "druhy-password-123" });
  await other.goto(url);
  await expect(other.locator("h1")).toContainText("nenalezena");

  // the same grimoire open twice: the older page cannot overwrite the newer save
  const second = await page.context().newPage();
  await second.goto(url);
  await expect(second.getByTestId("seat")).toHaveCount(2);
  await openSetup(second);
  await page.getByRole("textbox", { name: "Jméno hráče" }).fill("Olga");
  await page.getByRole("button", { name: "Přidat", exact: true }).click();
  await stored((st) => st.seats.length, 3);
  await second.getByRole("textbox", { name: "Jméno hráče" }).fill("Zbyněk");
  await second.getByRole("button", { name: "Přidat", exact: true }).click();
  await expect(second.getByTestId("save-status")).toHaveText("Neuloženo");
  await closeSetup(second);
  await second.getByRole("button", { name: "Načíst uloženou verzi" }).click();
  await expect(second.getByTestId("seat")).toHaveCount(3);
  await expect(second.locator("[data-seat=Olga]")).toBeVisible();

  // ended: everyone may look, nobody else may change it
  await closeSetup(page);
  await page.getByTestId("game-button").click();
  await expect(page.getByTestId("game-panel")).toContainText("Grimoár nemá termín");
  await page.getByRole("button", { name: "Nevím" }).click();
  await page.getByRole("button", { name: "Ukončit hru" }).click();
  await stored((st) => st.phase, "ended");
  await other.goto(url);
  await expect(other.getByTestId("save-status")).toHaveText("Jen pro čtení");
  await expect(other.getByRole("button", { name: "↶ Zpět" })).toHaveCount(0);
  await other.goto("/admin/botc/grimoary");
  await expect(other.locator("main")).toContainText("Odehrané hry ostatních");
  await expect(other.locator("main")).toContainText("vypravěč/ka Správce");
  await ctx.close();
});

/** A new grimoire without a session, two players typed in and saved. */
async function newGrimoire(page: Page) {
  await page.goto("/admin/botc/grimoary");
  await page.fill("#name", "Bez sítě");
  await page.getByRole("button", { name: "Založit grimoár" }).click();
  await expect(page.locator("h1")).toHaveText("Bez sítě");
  await openSetup(page);
  for (const name of ["Jana", "Petr"]) await addPlayer(page, name);
  await stored((st) => st.seats.length, 2);
}
async function addPlayer(page: Page, name: string) {
  await page.getByRole("textbox", { name: "Jméno hráče" }).fill(name);
  await page.getByRole("button", { name: "Přidat", exact: true }).click();
}

/**
 * No connection: the browser's offline mode, which does not reach the service worker's own requests, and every
 * request of the context failing, the worker's included.
 */
async function goOffline(page: Page, offline: boolean) {
  const ctx = page.context();
  if (offline) await ctx.route("**/*", (route) => route.abort("internetdisconnected"));
  else await ctx.unrouteAll();
  await ctx.setOffline(offline);
}

test("grimoire offline: played without a connection, opened again without one, saved once it is back", async ({ page }) => {
  await adminLogin(page);
  await newGrimoire(page);
  const url = page.url();
  // the service worker keeps the page, its files and the icons on the device
  await expect
    .poll(() => page.evaluate(async (key) => !!(await (await caches.open("grimoar-v1")).match(key, { ignoreVary: true })), url), { timeout: 15_000 })
    .toBe(true);

  // renamed on the server meanwhile: only the copy on the device still has the old name
  await sql("update grimoires set name = 'Přejmenovaný'");
  await goOffline(page, true);
  await addPlayer(page, "Offline");
  await expect(page.getByTestId("save-status")).toHaveText("Bez spojení – uloženo v tomto zařízení, na server až bude síť");
  // the page opened again without a connection: the copy on the device, with what was played since
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Bez sítě");
  await expect(page.getByTestId("seat")).toHaveCount(3);
  await expect(page.locator("[data-seat=Offline]")).toBeVisible();

  await goOffline(page, false);
  await stored((st) => st.seats.map((x) => x.name), ["Jana", "Petr", "Offline"]);
  await expect(page.getByTestId("save-status")).toHaveText("Uloženo");

  // online again, the page comes from the server
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Přejmenovaný");
  await expect(page.getByTestId("seat")).toHaveCount(3);
  await expect(page.getByTestId("save-status")).toHaveText("Uloženo");
});

test("grimoire: a page from before the site was updated asks to be reloaded, and the reload saves what was not saved", async ({ browser }) => {
  // without the service worker, so the test can answer the save as the updated server would
  const ctx = await browser.newContext({ locale: "cs-CZ", serviceWorkers: "block" });
  const page = await ctx.newPage();
  await adminLogin(page);
  await newGrimoire(page);
  await page.route(page.url(), (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 404, headers: { "x-nextjs-action-not-found": "1" }, body: "" }) : route.fallback(),
  );
  await addPlayer(page, "Nový");
  await expect(page.getByTestId("save-status")).toHaveText("Web se mezitím aktualizoval – načti stránku znovu, nic se neztratí");
  await page.unrouteAll();
  await stored((st) => st.seats.length, 2);
  await closeSetup(page);
  await page.getByRole("button", { name: "Načíst znovu" }).click();
  await stored((st) => st.seats.map((x) => x.name), ["Jana", "Petr", "Nový"]);
  await expect(page.getByTestId("save-status")).toHaveText("Uloženo");
  await ctx.close();
});

test("grimoire: the door and the Storyteller's spot, a pasted script, players drawing their characters, names from the session afterwards", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva"]);
  await adminLogin(page);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await expect(page.getByTestId("seat")).toHaveCount(5);

  // they will sit differently: five places without names, one more and back
  await openSetup(page);
  await page.getByRole("button", { name: "Smazat jména (rozesazení)" }).click();
  await expect(page.locator('[data-testid=seat][data-seat=""]')).toHaveCount(5);
  await page.getByRole("button", { name: "Přidat místo" }).click();
  await expect(page.getByTestId("seat")).toHaveCount(6);
  await page.getByRole("button", { name: "Ubrat místo" }).click();
  await expect(page.getByTestId("seat")).toHaveCount(5);

  // the Storyteller's spot turns the circle so it is at the bottom; a door after the first player
  await page.getByRole("button", { name: "🎩 Vypravěč" }).click();
  const middle = async (el: import("@playwright/test").Locator) => {
    const box = (await el.boundingBox())!;
    return box.y + box.height / 2;
  };
  const storyteller = await middle(page.locator("[data-gap=storyteller]"));
  for (const s of await page.getByTestId("seat").all()) expect(await middle(s)).toBeLessThan(storyteller);
  await closeSetup(page);
  await page.getByTestId("seat").first().click();
  await page.getByTestId("seat-panel").getByRole("button", { name: "🚪 Dveře" }).click();
  await expect(page.getByTestId("gap")).toHaveCount(2);
  await expect(page.getByTestId("town")).toContainText("Živí 5 z 5");

  // a script pasted as JSON; what the site does not know is said and left out
  await openSetup(page);
  await page.getByRole("button", { name: "Vložit JSON nebo soubor" }).click();
  await page.getByRole("textbox", { name: "Vložit JSON nebo soubor" }).fill(
    JSON.stringify([{ id: "_meta", name: "Malý script" }, "washerwoman", "chef", "empath", "poisoner", "imp", { id: "hrdina", name: "Homebrew Hrdina" }]),
  );
  await page.getByRole("button", { name: "Použít script" }).click();
  await expect(page.locator("#grimoire-script option:checked")).toHaveText("Malý script (JSON)");
  await expect(page.getByTestId("setup-panel")).toContainText("Web nezná (v grimoáru nebudou): Homebrew Hrdina");

  // the bag, then the players draw: the grimoire hides, each taps their place
  const tokens = await openTokens(page);
  for (const name of ["Pradlena", "Kuchař", "Empat", "Travič", "Čert"]) await tokens.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  await closeTokens(page);
  await page.getByTestId("setup-screen").getByRole("button", { name: "Losování hráči" }).click();
  await expect(page.locator("h1")).toHaveText("Losování postav");
  await expect(page.getByTestId("draw-left")).toHaveText("V pytlíku zbývá 5");
  const dialog = page.getByTestId("draw-dialog");
  for (let i = 0; i < 5; i++) {
    await page.locator("[data-testid=seat][data-drawn=no]").first().click();
    await dialog.getByRole("button", { name: "Ťukni a podívej se na svou postavu" }).click();
    await expect(dialog.getByTestId("drawn-role")).toBeVisible();
    await dialog.getByRole("button", { name: "Mám to – skrýt" }).click();
  }
  await expect(page.getByTestId("draw-left")).toHaveText("V pytlíku zbývá 0");
  await expect(page.getByTestId("town")).not.toContainText("Pradlena");
  // a place that has drawn shows nothing to the next player
  await page.locator("[data-testid=seat][data-drawn=yes]").first().click();
  await expect(dialog).toContainText("Toto místo už postavu má");
  await dialog.getByRole("button", { name: "Zpět" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Konec losování (vypravěč)" }).click();
  await expect(page.getByTestId("phase")).toHaveText("Příprava");
  await stored((st) => st.seats.flatMap((x) => (x.role ? [x.role] : [])).sort(), ["chef", "empath", "imp", "poisoner", "washerwoman"]);

  // names afterwards: tap the first place, then the session's players one by one, the grimoire moves on by itself
  await page.getByTestId("seat").first().click();
  for (const name of ["Eva", "Dan", "Cyril", "Bára", "Ada"]) {
    await page.getByTestId("seat-panel").getByRole("button", { name, exact: true }).click();
  }
  await expect(page.locator('[data-testid=seat][data-seat=""]')).toHaveCount(0);
  await expect(page.getByTestId("seat-panel")).toContainText("Propojeno s přihláškou na termín");

  // the game record counts the players, not the gaps, and links the pasted script to the script tool
  await endTheGame(page, "😇 Dobro");
  await expect
    .poll(() => sql<{ players: number; script_name: string }>("select players, script_name from games where session_id = $1", [sessionId]))
    .toEqual([{ players: 5, script_name: "Malý script" }]);
  const [game] = await sql<{ script_url: string }>("select script_url from games where session_id = $1", [sessionId]);
  expect(game.script_url).toContain("?script=");
  expect(await sql("select id from game_players where role is not null")).toHaveLength(5);
});

test("grimoire: players dragged to other places in the circle, then the seating locked", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/botc/grimoary");
  await page.fill("#name", "Rozesazení");
  await page.getByRole("button", { name: "Založit grimoár" }).click();
  await openSetup(page);
  for (const name of ["Jana", "Petr", "Olga", "Zbyněk"]) {
    await page.getByRole("textbox", { name: "Jméno hráče" }).fill(name);
    await page.getByRole("button", { name: "Přidat", exact: true }).click();
  }
  await closeSetup(page);
  await stored((st) => st.seats.map((x) => x.name), ["Jana", "Petr", "Olga", "Zbyněk"]);
  const names = (st: { seats: { name: string }[] }) => st.seats.map((x) => x.name);

  /** Drags one token onto the place of another, by the middle of its circle (the name is under it). */
  const drag = async (from: string, to: string) => {
    const [a, b] = [(await seat(page, from).boundingBox())!, (await seat(page, to).boundingBox())!];
    await page.mouse.move(a.x + a.width / 2, a.y + a.width / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.width / 2, { steps: 12 });
    await page.mouse.up();
  };

  // onto the place across: the two in between move one place back, the drag does not open the player
  await drag("Jana", "Olga");
  await stored(names, ["Petr", "Olga", "Jana", "Zbyněk"]);
  await expect(seat(page, "Jana")).toHaveAttribute("aria-pressed", "false");
  await seat(page, "Petr").click();
  await expect(seat(page, "Petr")).toHaveAttribute("aria-pressed", "true");

  // locked, also after a reload: dragging does nothing
  await page.getByTestId("seats-lock").click();
  await stored((st) => st.seatsLocked, true);
  await page.reload();
  await expect(page.getByTestId("seats-lock")).toHaveAttribute("aria-pressed", "true");
  await drag("Jana", "Petr");
  await page.getByTestId("seats-lock").click();
  await stored((st) => [st.seatsLocked, names(st)], [false, ["Petr", "Olga", "Jana", "Zbyněk"]]);

  // unlocked again; the last place next to the first goes the short way round, a swap
  await drag("Zbyněk", "Petr");
  await stored(names, ["Zbyněk", "Olga", "Jana", "Petr"]);

  // full screen: only the grimoire – the site's header, the admin menu and the footer go away, and come back
  await expect(page.locator("[data-admin-nav]")).toBeVisible();
  await page.getByRole("button", { name: "Celá obrazovka" }).click();
  await expect(page.locator("[data-admin-nav]")).toBeHidden();
  await expect(page.locator("body > header")).toBeHidden();
  await expect(page.locator("body > footer")).toBeHidden();
  await expect(page.getByTestId("town")).toBeVisible();
  await page.getByRole("button", { name: "Zrušit celou obrazovku" }).click();
  await expect(page.locator("[data-admin-nav]")).toBeVisible();
  await expect(page.locator("body > header")).toBeVisible();
});

test("grimoire: the bag counts each team against the setup for the players, also over the whole screen", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 }); // a tablet on its side
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva", "Filip", "Gita"]);
  await adminLogin(page);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await expect(page.getByTestId("seat")).toHaveCount(7);
  const count = (scope: Page | Locator, team: string) => scope.locator(`[data-team=${team}] [data-testid=bag-team-count]`);
  await openSetup(page);
  await expect(page.getByTestId("setup-screen")).toContainText("V pytlíku zatím nic není");

  const screen = await openTokens(page);
  await expect(count(screen, "townsfolk")).toHaveText("0 / 5");
  await expect(screen).toContainText("Rozložení pro 7 hráčů");
  for (const name of ["Pradlena", "Empat", "Mnich", "Strážkyně krkavců", "Panna", "Travič", "Baron"]) {
    await screen.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  }
  // the Baron counts: two Outsiders instead of two Townsfolk, and says so
  await expect(screen.locator("h2")).toHaveText("Výběr žetonů: 7 z 7");
  await expect(count(screen, "townsfolk")).toHaveText("5 / 3");
  await expect(count(screen, "outsider")).toHaveText("0 / 2");
  await expect(count(screen, "minion")).toHaveText("2 / 1");
  await expect(count(screen, "demon")).toHaveText("0 / 1");
  await expect(screen).toContainText("Baron: [+2 Podivíni]");
  await expect(screen.getByRole("button", { name: "Do pytlíku: Baron" }).getByTestId("role-badge")).toHaveText("+2 Podivíni");
  await expect(screen.getByTestId("bag-summary-count")).toHaveText(["5 / 3", "0 / 2", "2 / 1", "0 / 1"]);
  await expect(screen.getByTestId("bag-summary-by")).toHaveText(["Baron · základ 5", "Baron · základ 0"]);
  // the whole script on the tablet without scrolling
  expect(await screen.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);

  // the Imp instead of the Baron; the setup shows the bag as it is, and deals it
  await screen.getByRole("button", { name: "Do pytlíku: Baron" }).click();
  await screen.getByRole("button", { name: "Do pytlíku: Čert" }).click();
  await expect(count(screen, "demon")).toHaveText("1 / 1");
  await expect(count(screen, "townsfolk")).toHaveText("5 / 5");
  await expect(screen.getByTestId("bag-summary-by")).toHaveCount(0);
  await closeTokens(page);
  await expect(count(page.getByTestId("bag-contents"), "demon")).toHaveText("1 / 1");
  await dealAtRandom(page);
  await expect(page.getByTestId("town")).not.toContainText("bez postavy");
});

test("grimoire: the bag filled at random by the rules, the number of players and the Demon's bluffs over the whole screen", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva", "Filip", "Gita"]);
  await adminLogin(page);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await expect(page.getByTestId("seat")).toHaveCount(7);
  // the grimoire takes the whole width of the window, not the admin's column
  expect((await page.getByTestId("grimoire").boundingBox())!.width).toBeGreaterThan(1500);

  await openSetup(page);
  const screen = await openTokens(page);
  // one more player and back
  await screen.getByRole("button", { name: "Přidat místo" }).click();
  await expect(screen).toContainText("Rozložení pro 8 hráčů");
  await screen.getByRole("button", { name: "Ubrat místo" }).click();
  await expect(screen).toContainText("Rozložení pro 7 hráčů");

  /** The stored bag and bluffs */
  const stored = async () => {
    const [row] = await sql<{ state: { bag: string[]; bluffs: (string | null)[] } }>("select state from grimoires order by id desc limit 1");
    return row.state;
  };
  // filled at random, again and again: always as many as the bag needs and no team against the rules
  for (let i = 0; i < 5; i++) {
    await screen.getByRole("button", { name: "🎲 Naplnit náhodně" }).click();
    await expect(screen.locator("h2")).toHaveText(/^Výběr žetonů: (\d+) z \1$/);
    await expect(screen.locator("[data-testid=bag-summary-count].text-accent")).toHaveCount(0);
  }
  await expect.poll(async () => (await stored()).bag.length).toBeGreaterThanOrEqual(7);

  // a bluff picked on the full screen, from the good characters that are not in the bag
  const bag = (await stored()).bag;
  const bluffs = screen.getByTestId("bag-bluffs");
  await bluffs.getByRole("button", { name: "Blafy Démona 1" }).click();
  const choices = screen.getByTestId("bluff-choices");
  await expect(choices).toContainText("Blaf Démona 1: vyber postavu");
  await expect(choices.locator("[data-team=minion]")).toHaveCount(0);
  const offered = await choices.getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(offered.filter((label) => label.startsWith("Blafy Démona: ")).length).toBeGreaterThan(0);
  await choices.getByRole("button", { name: /^Blafy Démona: / }).first().click();
  await expect(screen.getByTestId("bluff-choices")).toHaveCount(0);
  await expect(screen.getByRole("button", { name: "Do pytlíku: Čert" })).toBeVisible();
  await expect.poll(async () => (await stored()).bluffs[0]).not.toBeNull();
  // three at random, none of them in the bag
  await bluffs.getByRole("button", { name: "🎲 Náhodně" }).click();
  await expect.poll(async () => (await stored()).bluffs.filter(Boolean).length).toBe(3);
  for (const b of (await stored()).bluffs) expect(bag).not.toContain(b);
});

test("grimoire: the Drunk brings an extra Townsfolk into the bag, whoever gets it is the Drunk, handed out or drawn", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva", "Filip"]);
  await adminLogin(page);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await expect(page.getByTestId("seat")).toHaveCount(6);
  await openSetup(page);

  // six players: three Townsfolk and the Drunk as the Outsider, plus the Townsfolk the Drunk will think they are
  const tokens = await openTokens(page);
  for (const name of ["Pradlena", "Kuchař", "Empat", "Mnich", "Opilec", "Travič", "Čert"]) {
    await tokens.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  }
  await expect(tokens.getByRole("button", { name: "Do pytlíku: Opilec" }).getByTestId("role-badge")).toHaveText("+1 Měšťan");
  await closeTokens(page);
  await expect(page.getByTestId("setup-screen")).toContainText("Pytlík: 7 z 7");
  const count = (team: string) => page.locator(`[data-team=${team}] [data-testid=bag-team-count]`);
  await expect(count("townsfolk")).toHaveText("4 / 4");
  await expect(count("outsider")).toHaveText("1 / 1");
  await expect(page.getByTestId("distribution")).toContainText("Opilec: Do pytlíku patří navíc jeden Měšťan.");

  /** The tokens the players got (the Drunk's is the Townsfolk they think they are) and how many Drunks there are */
  const dealt = async () => {
    const [row] = await sql<{ state: { seats: { role: string | null; believedRole: string | null }[] } }>("select state from grimoires order by id desc limit 1");
    return {
      tokens: row.state.seats.map((s) => (s.role === "drunk" ? s.believedRole : s.role)).sort(),
      drunks: row.state.seats.filter((s) => s.role === "drunk").length,
    };
  };
  const all = { tokens: ["chef", "empath", "imp", "monk", "poisoner", "washerwoman"], drunks: 1 };
  await dealAtRandom(page);
  await expect(page.getByTestId("town")).toContainText("Opilec");
  await expect.poll(dealt).toEqual(all);

  // the players draw: nobody sees the Drunk, the last draw decides who it is
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Losování hráči" }).click();
  await expect(page.getByTestId("draw-left")).toHaveText("V pytlíku zbývá 6");
  const dialog = page.getByTestId("draw-dialog");
  for (let i = 0; i < 6; i++) {
    await page.locator("[data-testid=seat][data-drawn=no]").first().click();
    await dialog.getByRole("button", { name: "Ťukni a podívej se na svou postavu" }).click();
    await expect(dialog.getByTestId("drawn-role")).not.toHaveText("Opilec");
    await dialog.getByRole("button", { name: "Mám to – skrýt" }).click();
  }
  await expect(page.getByTestId("draw-left")).toHaveText("V pytlíku zbývá 0");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Konec losování (vypravěč)" }).click();
  await expect(page.getByTestId("town")).toContainText("Opilec");
  await expect.poll(dealt).toEqual(all);
});

test("grimoire: the first night prepared before the game, the Poisoner's token at night, a once-per-game ability used", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva", "Filip", "Gita"]);
  await adminLogin(page);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await openSetup(page);
  const tokens = await openTokens(page);
  for (const name of ["Pradlena", "Kuchař", "Empat", "Zabiják", "Mnich", "Travič", "Čert"]) {
    await tokens.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  }
  await closeTokens(page);
  await dealAtRandom(page);
  await closeSetup(page);

  /** The stored seats: name, character, reminders */
  const seats = async () => {
    const [row] = await sql<{ state: { seats: { name: string; role: string; reminders: { text: string }[] }[] } }>(
      "select state from grimoires order by id desc limit 1",
    );
    return row.state.seats;
  };
  await expect.poll(async () => (await seats()).every((x) => x.role)).toBe(true);
  const all = await seats();
  const who = (role: string) => all.find((x) => x.role === role)!.name;
  const evil = (i: number) => ["poisoner", "imp"].includes(all[(i + all.length) % all.length].role);
  const chefNumber = all.filter((_, i) => evil(i) && evil(i + 1)).length;

  // before the game: the first night, to prepare the Washerwoman's tokens; the Chef's number is worked out
  await page.getByRole("tab", { name: "1. noc" }).click();
  const night = page.getByTestId("night-panel");
  await expect(night).toContainText("První noc – příprava");
  await night.locator("[data-step=washerwoman] button").nth(0).click();
  const washerwoman = night.locator("[data-step=washerwoman]");
  await expect(washerwoman).toContainText("Polož oba žetony");
  await washerwoman.getByRole("button", { name: "Měšťan →" }).click();
  await expect(page.getByTestId("placing")).toContainText("Ťukni na hráče: Měšťan (Pradlena)");
  await seat(page, who("monk")).click();
  await washerwoman.getByRole("button", { name: "Někdo jiný →" }).click();
  await seat(page, who("imp")).click();
  await expect(washerwoman.getByTestId("step-info")).toHaveText(`👉 Ukaž postavu Mnich a ukaž na hráče ${who("monk")} a ${who("imp")}.`);
  await night.locator("[data-step=chef] button").nth(0).click();
  await expect(night.locator("[data-step=chef]").getByTestId("step-info")).toHaveText(`👉 Ukaž číslo ${chefNumber}.`);

  // the night: the Poisoner picks the Washerwoman, whose step then warns; tomorrow's pick moves the token
  await page.getByRole("button", { name: "Začít hru → 1. noc" }).click();
  await expect(page.getByTestId("phase")).toHaveText("1. noc");
  const poisoner = night.locator("[data-step=poisoner]");
  await poisoner.locator("button").nth(1).click();
  await poisoner.getByRole("button", { name: "Otrávený →" }).click();
  await seat(page, who("washerwoman")).click();
  await expect(poisoner).toContainText(`Otrávený: ${who("washerwoman")}`);
  await night.locator("[data-step=washerwoman] button").nth(1).click();
  await expect(night.locator("[data-step=washerwoman]")).toContainText(`${who("washerwoman")} je otrávený/á – informace může být nepravdivá.`);
  await poisoner.locator("button").nth(1).click();
  await poisoner.getByRole("button", { name: "Otrávený →" }).click();
  await seat(page, who("chef")).click();
  await expect
    .poll(async () => (await seats()).flatMap((x) => x.reminders.filter((r) => r.text === "Otrávený").map(() => x.name)))
    .toEqual([who("chef")]);

  // the Slayer's shot is spent: marked at the player, and taken back
  await page.getByRole("tab", { name: "Hráč" }).click();
  await seat(page, who("slayer")).click();
  const used = page.getByTestId("seat-panel").getByTestId("ability-used");
  await expect(used).toHaveText("Použil/a schopnost");
  await used.click();
  await expect(used).toHaveText("✓ Schopnost použita");
  await expect(seat(page, who("slayer"))).toBeVisible();
  await expect(page.getByTestId("reminder").filter({ hasText: "Bez schopnosti" })).toHaveCount(1);
  await used.click();
  await expect(page.getByTestId("reminder").filter({ hasText: "Bez schopnosti" })).toHaveCount(0);
});

test("grimoire: after the deal each player is shown their character in turn; at night the Demon its Minions and bluffs, only the card on the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva", "Filip", "Gita"]);
  await adminLogin(page);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await openSetup(page);
  const tokens = await openTokens(page);
  for (const name of ["Pradlena", "Kuchař", "Empat", "Zabiják", "Mnich", "Travič", "Čert"]) {
    await tokens.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  }
  await tokens.getByTestId("bag-bluffs").getByRole("button", { name: "Blafy Démona 1" }).click();
  await tokens.getByRole("button", { name: "Blafy Démona: Vědma" }).click();
  await closeTokens(page);
  await expect(page.getByTestId("setup-screen").getByRole("button", { name: "Ukázat hráčům jejich postavy" })).toHaveCount(0);
  await dealAtRandom(page);
  await expect
    .poll(async () => {
      const [row] = await sql<{ state: { seats: { role: string | null }[] } }>("select state from grimoires order by id desc limit 1");
      return row?.state.seats.every((x) => x.role);
    })
    .toBe(true);
  const [{ state }] = await sql<{ state: { seats: { name: string; role: string }[] } }>("select state from grimoires order by id desc limit 1");
  const all = state.seats;
  const role = (i: number) => roleName(findRole(all[i].role)!, "cs");
  const who = (r: string) => all.find((x) => x.role === r)!.name;

  // round the table: the first player's card, shown on its own, then the next player's
  await page.getByTestId("setup-screen").getByRole("button", { name: "Ukázat hráčům jejich postavy" }).click();
  const screen = page.getByTestId("show-screen");
  await expect(screen).toContainText(`pro: ${all[0].name}`);
  await screen.getByRole("button", { name: "Ukázat", exact: false }).click();
  const card = page.getByTestId("show-card");
  await expect(card).toContainText(`Jsi${role(0)}`);
  await expect(card).toContainText(all[0].role === "poisoner" || all[0].role === "imp" ? "Zlý tým" : "Dobrý tým");
  // the card covers everything: the setup and the grimoire stay under it
  const covered = () => page.evaluate(() => [[5, 5], [innerWidth - 5, innerHeight - 5]].every(([x, y]) => !!document.elementFromPoint(x, y)?.closest("[data-testid=show-card]")));
  expect(await covered()).toBe(true);
  await card.click();
  await screen.getByTestId("show-next").click();
  await expect(screen).toContainText(`pro: ${all[1].name}`);
  await screen.getByRole("button", { name: "Ukázat", exact: false }).click();
  await expect(card).toContainText(`Jsi${role(1)}`);
  await card.click();
  await screen.getByRole("button", { name: "Hotovo" }).click();
  await expect(screen).toBeHidden();
  await expect(page.getByTestId("setup-screen")).toBeVisible();

  // the first night: the Demon's card has its Minion and the bluff; a line changed before it is shown
  await page.getByTestId("setup-screen").getByRole("button", { name: "Začít hru → 1. noc" }).click();
  const night = page.getByTestId("night-panel");
  await night.locator("[data-step=demonInfo] button").nth(1).click();
  await night.locator("[data-step=demonInfo]").getByTestId("show-button").click();
  await expect(screen).toContainText(`pro: ${who("imp")}`);
  await expect(screen.getByRole("button", { name: `Odebrat: ${who("poisoner")}` })).toBeVisible();
  await screen.getByRole("button", { name: "+ Další řádek" }).click();
  await screen.getByTestId("show-line-editor").last().getByRole("button", { name: "+ Text" }).click();
  await screen.getByPlaceholder("Text pro hráče").fill("Hodně štěstí");
  await screen.getByRole("button", { name: "Ukázat", exact: false }).click();
  await expect(card.getByTestId("show-line")).toHaveText([`Tito jsou tví Přisluhovači${who("poisoner")}`, "Tyto postavy nejsou ve hřeVědma", "Hodně štěstí"]);
  expect(await covered()).toBe(true);
  await card.click();
  await screen.getByRole("button", { name: "Hotovo" }).click();
  await expect(screen).toBeHidden();

  // the Chef's number on the card; at a player, "You are"
  await night.locator("[data-step=chef] button").nth(1).click();
  await night.locator("[data-step=chef]").getByTestId("show-button").click();
  const evil = (i: number) => ["poisoner", "imp"].includes(all[(i + all.length) % all.length].role);
  await expect(screen.getByTestId("show-number")).toHaveText(String(all.filter((_, i) => evil(i) && evil(i + 1)).length));
  await screen.getByRole("button", { name: "Hotovo" }).click();
  await page.getByRole("tab", { name: "Hráč" }).click();
  await seat(page, who("monk")).click();
  await page.getByTestId("seat-panel").getByTestId("show-button").click();
  await screen.getByRole("button", { name: "Ukázat", exact: false }).click();
  await expect(card).toContainText("JsiMnich");
});

test("grimoire: a new one points at the setup; night 2: the Demon's attack, the Monk and the Soldier, the Imp passing to the Scarlet Woman", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva", "Filip", "Gita"]);
  await adminLogin(page);
  await page.goto(`/admin/botc/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await expect(page.getByTestId("setup-hint")).toHaveText("Začni tady: hráči, script a postavy");
  await openSetup(page);
  const tokens = await openTokens(page);
  for (const name of ["Mnich", "Voják", "Kuchař", "Empat", "Zabiják", "Šarlatová žena", "Čert"]) {
    await tokens.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  }
  await closeTokens(page);
  await dealAtRandom(page);
  await closeSetup(page);
  await expect(page.getByTestId("setup-hint")).toHaveCount(0);

  const seats = async () => {
    const [row] = await sql<{ state: { seats: { name: string; role: string; dead: boolean; reminders: { text: string }[] }[] } }>(
      "select state from grimoires order by id desc limit 1",
    );
    return row.state.seats;
  };
  await expect.poll(async () => (await seats()).every((x) => x.role)).toBe(true);
  const all = await seats();
  const who = (role: string) => all.find((x) => x.role === role)!.name;

  await page.getByRole("button", { name: "Začít hru → 1. noc" }).click();
  await page.getByRole("button", { name: "Ráno → 1. den" }).click();
  await page.getByRole("button", { name: "Soumrak → 2. noc" }).click();
  await expect(page.getByTestId("phase")).toHaveText("2. noc");
  const night = page.getByTestId("night-panel");

  // the Scarlet Woman's "Demon" goes straight to her, no player to tap
  const scarlet = night.locator("[data-step=scarletwoman]");
  await scarlet.locator("button").nth(1).click();
  await scarlet.getByRole("button", { name: "Démon", exact: true }).click();
  await expect(page.getByTestId("placing")).toHaveCount(0);
  await stored((st) => st.seats.find((x) => x.name === who("scarletwoman"))!.reminders.map((r) => r.text), ["Démon"]);
  await scarlet.getByRole("button", { name: "✓ Démon" }).click();
  await stored((st) => st.seats.find((x) => x.name === who("scarletwoman"))!.reminders.map((r) => r.text), []);

  // the Monk protects the Chef: the Imp's attack does not kill him, nor the Soldier; the Empath dies
  const monk = night.locator("[data-step=monk]");
  await monk.locator("button").nth(1).click();
  await monk.getByRole("button", { name: "Chráněný →" }).click();
  await seat(page, who("chef")).click();
  const imp = night.locator("[data-step=imp]");
  await imp.locator("button").nth(1).click();
  const attack = async (role: string) => {
    await imp.getByRole("button", { name: "Mrtvý →" }).click();
    await seat(page, who(role)).click();
  };
  await attack("chef");
  await expect(imp.getByTestId("step-info")).toHaveText(`👉 ${who("chef")} nezemře (Mnich).`);
  await attack("soldier");
  await expect(imp.getByTestId("step-info")).toHaveText(`👉 ${who("soldier")} nezemře (Voják).`);
  await attack("empath");
  await expect(imp.getByTestId("step-info")).toHaveCount(0);
  await expect(page.getByTestId("town")).toContainText("Živí 6 z 7");

  // the Imp kills himself: with 6 alive the Scarlet Woman is the new Imp
  await attack("imp");
  await expect(imp.getByTestId("step-info")).toHaveText(`👉 Nový Čert: ${who("scarletwoman")} (Šarlatová žena).`);
  await expect(page.getByTestId("town")).toContainText("Živí 5 z 7");

  // the chronicle: the Chef and the Soldier lived only through attacks the Imp took back
  await page.getByRole("tab", { name: "Kronika" }).click();
  const chronicle = page.getByTestId("chronicle");
  await expect(chronicle).toContainText(`${who("empath")} (Empat) zemřel/a – Čert`);
  await expect(chronicle).toContainText(`${who("imp")} (Čert) zemřel/a – Čert`);
  await expect(chronicle).toContainText(`${who("scarletwoman")}: Šarlatová žena → Čert`);
  await expect(chronicle).not.toContainText("nezemřel");
  await page.getByRole("tab", { name: "Noc" }).click();
  await expect.poll(async () => (await seats()).filter((x) => x.role === "imp").map((x) => [x.name, x.dead])).toEqual(
    all.filter((x) => ["imp", "scarletwoman"].includes(x.role)).map((x) => [x.name, x.role === "imp"]),
  );
});

test("grimoire: the first night with the Spy and the Recluse shows every number and character they allow, and jinxes in the setup", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await adminLogin(page);
  const [owner] = await sql<{ id: number }>("select id from admin_users limit 1");
  // round the circle: Ada the Imp, Bára the Recluse, Cyril the Chef, Dan the Spy, Eva the Poisoner, Filip the Empath, Gita the Washerwoman
  const cast = { Ada: "imp", Bára: "recluse", Cyril: "chef", Dan: "spy", Eva: "poisoner", Filip: "empath", Gita: "washerwoman" };
  const seats = Object.entries(cast).map(([name, role]) => ({ ...newSeat(name), role }));
  const state: GrimoireState = { ...newGrimoireState({ id: null, name: "Trouble Brewing", roleIds: TROUBLE_BREWING }, seats), phase: "night", round: 1 };
  const [{ id }] = await sql<{ id: number }>("insert into grimoires (name, owner_id, state) values ($1, $2, $3) returning id", ["Špeh a Samotář", owner.id, state]);
  await page.goto(`/admin/botc/grimoary/${id}`);
  const night = page.getByTestId("night-panel");
  const open = (role: string) => night.locator(`[data-step=${role}] button`).nth(1).click();

  // the Chef: the Recluse & Imp pair and the Spy & Poisoner pair may each count or not
  await open("chef");
  const chef = night.locator("[data-step=chef]");
  await expect(chef.getByTestId("step-info")).toHaveText("👉 Ukaž číslo 0, 1 nebo 2 (podle postav 1).");
  await expect(chef.getByTestId("step-note")).toHaveText([
    "ℹ️ Bára (Samotář) se může jevit jako zlý/á, Přisluhovač nebo Démon – u každé informace jinak.",
    "ℹ️ Dan (Špeh) se může jevit jako dobrý/á, Měšťan nebo Podivín – u každé informace jinak.",
  ]);
  // the Empath between the Poisoner and the Washerwoman: no doubt
  await open("empath");
  await expect(night.locator("[data-step=empath]").getByTestId("step-info")).toHaveText("👉 Ukaž číslo 1.");
  // the Washerwoman's Townsfolk on the Spy: any of the script's Townsfolk
  await open("washerwoman");
  const washerwoman = night.locator("[data-step=washerwoman]");
  await washerwoman.getByRole("button", { name: "Měšťan →" }).click();
  await seat(page, "Dan").click();
  await washerwoman.getByRole("button", { name: "Někdo jiný →" }).click();
  await seat(page, "Cyril").click();
  await expect(washerwoman.getByTestId("step-info")).toHaveText(/^👉 Ukaž jednu z postav Pradlena, Knihovník, .* nebo Starosta a ukaž na hráče Dan a Cyril\.$/);
  await expect(washerwoman.getByTestId("step-note")).toHaveText(["ℹ️ Dan (Špeh) se může jevit jako dobrý/á, Měšťan nebo Podivín – u každé informace jinak."]);

  // the Spy at the table with the Damsel: their jinx in the setup
  await openSetup(page);
  await expect(page.getByTestId("jinxes")).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText("Uloženo");
  await sql("update grimoires set state = jsonb_set(state, '{seats,1,role}', '\"damsel\"'), version = version + 1 where id = $1", [id]);
  await page.reload();
  await openSetup(page);
  await expect(page.getByTestId("jinxes")).toContainText("Kráska + Špeh: If the Spy is (or has been) in play, the Damsel is poisoned.");
});

test("grimoire: the experimental Demons – the Ojo's character, Legion's tokens in the bag, the Lord of Typhon's line", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await adminLogin(page);
  const [owner] = await sql<{ id: number }>("select id from admin_users limit 1");
  const create = async (cast: Record<string, string | null>, roleIds: string[], change: Partial<GrimoireState> = {}) => {
    const seats = Object.entries(cast).map(([name, role]) => ({ ...newSeat(name), role }));
    const state: GrimoireState = { ...newGrimoireState({ id: null, name: "Experimentální", roleIds }, seats), ...change };
    const [{ id }] = await sql<{ id: number }>("insert into grimoires (name, owner_id, state) values ($1, $2, $3) returning id", ["Démoni", owner.id, state]);
    await page.goto(`/admin/botc/grimoary/${id}`);
  };

  // night 2: the Ojo picks the Chef, who dies; a character not in play leaves it to the Storyteller
  await create({ Ada: "ojo", Bára: "chef", Cyril: "empath", Dan: "monk", Eva: "poisoner" }, TROUBLE_BREWING, { phase: "night", round: 2 });
  const ojo = page.getByTestId("night-panel").locator("[data-step=ojo]");
  await ojo.locator("button").nth(1).click();
  await ojo.getByTestId("ojo-pick").selectOption({ label: "Kuchař" });
  await expect(page.getByTestId("town")).toContainText("Živí 4 z 5");
  await ojo.getByTestId("ojo-pick").selectOption({ label: "Pradlena" });
  await expect(ojo).toContainText("Pradlena není ve hře – kdo zemře, vyber žetonem „Mrtvý“.");

  // Legion: as many of its tokens in the bag as the Storyteller likes
  await create({ Ada: null, Bára: null, Cyril: null, Dan: null, Eva: null }, ["legion", "chef", "empath", "monk", "mayor"]);
  await openSetup(page);
  const tokens = await openTokens(page);
  await tokens.getByRole("button", { name: "Do pytlíku: Legie" }).click();
  await expect(tokens.getByTestId("legion-count")).toContainText("Legií v pytlíku: 1");
  await tokens.getByRole("button", { name: "Přidat Legii" }).click();
  await tokens.getByRole("button", { name: "Přidat Legii" }).click();
  await expect(tokens.getByTestId("legion-count")).toContainText("Legií v pytlíku: 3");
  await stored((st) => (st as unknown as GrimoireState).bag.filter((id) => id === "legion").length, 3);

  // the Lord of Typhon between two good players: lined up with one tap
  await create({ Ada: "lordoftyphon", Bára: "chef", Cyril: "poisoner", Dan: "empath", Eva: "spy", Filip: "monk", Gita: "mayor" }, ["lordoftyphon", ...TROUBLE_BREWING]);
  const setup = await openSetup(page);
  await expect(setup).toContainText("Zlí nesedí v řadě s Pánem bouře uprostřed.");
  await setup.getByRole("button", { name: "Seřadit zlé kolem Pána bouře" }).click();
  await expect(setup).not.toContainText("Zlí nesedí v řadě");
  await stored((st) => typhonInLine(st as unknown as GrimoireState), true);
});

test("grimoire: only administrators delete grimoires, also another account's finished one", async ({ page, browser }) => {
  await createAdminUser({ email: "org@example.com", password: "org-password-123", nickname: "Organizátorka", role: "organizer" });
  const ctx = await browser.newContext({ locale: "cs-CZ" });
  const org = await ctx.newPage();
  await adminLogin(org, { email: "org@example.com", password: "org-password-123" });
  await org.goto("/admin/botc/grimoary");
  await org.fill("#name", "Zkušební hra");
  await org.getByRole("button", { name: "Založit grimoár" }).click();
  await endTheGame(org, "Nevím");
  await stored((st) => st.phase, "ended");
  // an organiser deletes nothing, not even their own
  await expect(org.getByTestId("game-panel").getByRole("button", { name: "Smazat grimoár" })).toHaveCount(0);
  await org.goto("/admin/botc/grimoary");
  await expect(org.getByTestId("grimoires")).toContainText("Zkušební hra");
  await expect(org.getByRole("button", { name: /^Smazat grimoár/ })).toHaveCount(0);
  await ctx.close();

  // the administrator sees it among the others' games and deletes it from the list
  await adminLogin(page);
  await page.goto("/admin/botc/grimoary");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Smazat grimoár: Zkušební hra" }).click();
  await expect(page.locator("main")).not.toContainText("Zkušební hra");
  expect(await sql("select id from grimoires")).toHaveLength(0);
});

test("grimoire: Fabled and Loric – the script's come by themselves, more from the setup, in the town's corner with their ability and tokens", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await adminLogin(page);
  await newGrimoire(page);

  // a script with a jinx and its Djinn, as the club's script tool makes it
  const setup = page.getByTestId("setup-screen");
  await setup.getByRole("button", { name: "Vložit JSON nebo soubor" }).click();
  // and a homebrew character with a rule of its own, so the Bootlegger
  const script = [
    { id: "_meta", name: "Se Džinem", bootlegger: ["Mrtví smí šeptat jen u okna."] },
    ...["chef", "spy", "damsel", "imp", "djinn", "bootlegger"],
    { id: "hrdina", name: "Hrdina", team: "townsfolk", ability: "Jednou za hru zachráníš hráče." },
  ];
  await setup.getByRole("textbox", { name: "Vložit JSON nebo soubor" }).fill(JSON.stringify(script));
  await setup.getByRole("button", { name: "Použít script" }).click();
  await expect(page.locator("#grimoire-script option:checked")).toHaveText("Se Džinem (JSON)");
  const fabled = page.getByTestId("fabled-setup");
  await expect(fabled.getByRole("button", { name: "Odebrat ze hry: Džin" })).toContainText("ze scriptu");
  await expect(fabled.getByRole("button", { name: "Odebrat ze hry: Pašerák" })).toContainText("ze scriptu");
  await expect(setup.getByText(/^Web nezná/)).toHaveText("Web nezná (v grimoáru nebudou): Hrdina");
  // the Storm Catcher and the Pope added for this table
  await fabled.getByRole("button", { name: "+ Přidat" }).click();
  await fabled.getByRole("button", { name: "Přidat do hry: Lapač bouří" }).click();
  await fabled.getByRole("button", { name: "Přidat do hry: Papež" }).click();

  // the Pope: a good character into the bag twice, out with the third tap
  const tokens = await openTokens(page);
  await expect(tokens.getByTestId("pope-hint")).toBeVisible();
  const chef = tokens.getByRole("button", { name: "Do pytlíku: Kuchař" });
  await chef.click();
  await chef.click();
  await expect(chef).toContainText("2× v pytlíku");
  await stored((st) => (st as unknown as { bag: string[] }).bag, ["chef", "chef"]);
  await chef.click();
  await stored((st) => (st as unknown as { bag: string[] }).bag, []);
  await closeTokens(page);
  await fabled.getByRole("button", { name: "Odebrat ze hry: Papež" }).click();
  await closeSetup(page);
  await stored((st) => (st as unknown as { fabled?: string[] }).fabled, ["djinn", "bootlegger", "stormcatcher"]);

  // in the town's corner; the Djinn shows its ability and the script's jinxes, the Bootlegger its homebrew
  const corner = page.getByTestId("fabled-tokens");
  await expect(corner.getByRole("button")).toHaveCount(3);
  await corner.getByRole("button", { name: "Pašerák", exact: true }).click();
  const homebrew = page.getByTestId("homebrew");
  await expect(homebrew).toContainText("Mrtví smí šeptat jen u okna.");
  await expect(homebrew).toContainText("Hrdina · Měšťané");
  await expect(homebrew).toContainText("Jednou za hru zachráníš hráče.");
  await corner.getByRole("button", { name: "Džin", exact: true }).click();
  const panel = page.getByTestId("fabled-panel");
  await expect(panel).toContainText("Použij speciální pravidlo Džina");
  await expect(panel.getByTestId("djinn-jinxes")).toContainText("Kráska + Špeh");

  // the Storm Catcher's token on a player, who then only dies by execution
  await corner.getByRole("button", { name: "Lapač bouří", exact: true }).click();
  await panel.getByRole("button", { name: "Chycen bouří →" }).click();
  await seat(page, "Jana").click();
  await expect(panel).toContainText("Chycen bouří: Jana");
  await stored((st) => st.seats.map((x) => x.reminders.map((r) => r.text)), [["Chycen bouří"], []]);
  await seat(page, "Jana").click();
  await expect(page.getByTestId("seat-panel")).toContainText("Chycen bouří: může zemřít jen popravou.");

  // taken out of the game, its token goes too
  await corner.getByRole("button", { name: "Lapač bouří", exact: true }).click();
  await panel.getByRole("button", { name: "Odebrat ze hry" }).click();
  await expect(corner.getByRole("button")).toHaveCount(2);
  await stored((st) => st.seats.map((x) => x.reminders.length), [0, 0]);
});
