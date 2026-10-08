import { expect, test, type Locator, type Page } from "@playwright/test";
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

test("grimoire: from a session, hand out the bag, the first night, a death and a reminder, the game into the session's games", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 }); // a tablet on its side
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva", "Filip", "Gita"]);
  await adminLogin(page);

  await page.goto(`/admin/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await expect(page).toHaveURL(/\/admin\/grimoary\/\d+$/);
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
  await expect(page).toHaveURL(new RegExp(`/admin/termin/${sessionId}#hry$`));
  await expect(page.locator("#hry")).toContainText("Trouble Brewing");
  await expect(page.locator("#hry")).toContainText("vyhrálo dobro");
  await expect(page.getByTestId("session-grimoires")).toContainText("Konec hry");

  // back into the game by mistake and out again: the same game record is updated, not a second one
  await page.goto(page.url().replace(/\/admin\/termin\/.*/, "") + (await page.getByTestId("session-grimoires").locator("a").first().getAttribute("href")));
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
  await page.goto("/admin/grimoary");
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
  await other.goto("/admin/grimoary");
  await expect(other.locator("main")).toContainText("Odehrané hry ostatních");
  await expect(other.locator("main")).toContainText("vypravěč/ka Správce");
  await ctx.close();
});

test("grimoire: the door and the Storyteller's spot, a pasted script, players drawing their characters, names from the session afterwards", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva"]);
  await adminLogin(page);
  await page.goto(`/admin/termin/${sessionId}`);
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
  await page.goto("/admin/grimoary");
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
  await page.goto(`/admin/termin/${sessionId}`);
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
  await page.goto(`/admin/termin/${sessionId}`);
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
  await page.goto(`/admin/termin/${sessionId}`);
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
  await page.goto(`/admin/termin/${sessionId}`);
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

test("grimoire: only administrators delete grimoires, also another account's finished one", async ({ page, browser }) => {
  await createAdminUser({ email: "org@example.com", password: "org-password-123", nickname: "Organizátorka", role: "organizer" });
  const ctx = await browser.newContext({ locale: "cs-CZ" });
  const org = await ctx.newPage();
  await adminLogin(org, { email: "org@example.com", password: "org-password-123" });
  await org.goto("/admin/grimoary");
  await org.fill("#name", "Zkušební hra");
  await org.getByRole("button", { name: "Založit grimoár" }).click();
  await endTheGame(org, "Nevím");
  await stored((st) => st.phase, "ended");
  // an organiser deletes nothing, not even their own
  await expect(org.getByTestId("game-panel").getByRole("button", { name: "Smazat grimoár" })).toHaveCount(0);
  await org.goto("/admin/grimoary");
  await expect(org.getByTestId("grimoires")).toContainText("Zkušební hra");
  await expect(org.getByRole("button", { name: /^Smazat grimoár/ })).toHaveCount(0);
  await ctx.close();

  // the administrator sees it among the others' games and deletes it from the list
  await adminLogin(page);
  await page.goto("/admin/grimoary");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Smazat grimoár: Zkušební hra" }).click();
  await expect(page.locator("main")).not.toContainText("Zkušební hra");
  expect(await sql("select id from grimoires")).toHaveLength(0);
});
