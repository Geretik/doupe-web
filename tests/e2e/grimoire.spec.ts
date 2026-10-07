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
  await expect(page.locator("#grimoire-script option:checked")).toHaveText("Trouble Brewing");
  await expect(page.getByTestId("distribution")).toContainText("Rozložení pro 7 hráčů");

  // five Townsfolk, a Minion and the Demon into the bag, handed out at random
  for (const name of ["Pradlena", "Empat", "Mnich", "Strážkyně krkavců", "Panna", "Travič", "Čert"]) {
    await page.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  }
  await expect(page.locator("main")).toContainText("Pytlík: 7 z 7");
  await page.getByRole("button", { name: "Rozdat náhodně" }).click();
  await expect(page.getByTestId("town")).not.toContainText("bez postavy");
  await expect(page.locator("[data-testid=distribution] tbody tr").first()).toContainText("Měšťané555");

  // Ada is the Drunk who thinks she is the Chef
  await seat(page, "Ada").click();
  const panel = page.getByTestId("seat-panel");
  await panel.getByRole("button", { name: "Změnit" }).click();
  await panel.getByRole("button", { name: "Postava: Opilec" }).click();
  await panel.getByRole("button", { name: "Vybrat" }).click();
  await panel.getByRole("button", { name: "Myslí si, že je: Kuchař" }).click();
  await expect(seat(page, "Ada")).toContainText("Opilec");

  // the Demon's bluffs
  await page.getByRole("tab", { name: "Příprava" }).click();
  await page.getByRole("button", { name: "Blafy Démona 1" }).click();
  await page.getByRole("button", { name: "Blafy Démona: Vědma" }).click();

  // the first night: only the steps of the characters in play, the Drunk under the Chef
  await page.getByRole("button", { name: "Začít hru → 1. noc" }).click();
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

  // good wins: the game goes into the session's games played
  await page.getByRole("tab", { name: "Hra" }).click();
  await page.getByRole("button", { name: "😇 Dobro" }).click();
  await expect(page.getByTestId("recorded")).toBeVisible();
  const games = await sql<{ script_name: string; script_url: string; winner: string; players: number; demon_bluffs: string[] }>(
    "select script_name, script_url, winner, players, demon_bluffs from games where session_id = $1",
    [sessionId],
  );
  expect(games).toHaveLength(1);
  expect(games[0]).toMatchObject({ script_name: "Trouble Brewing", winner: "good", players: 7, demon_bluffs: ["fortuneteller"] });
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
  await page.getByRole("tab", { name: "Hra" }).click();
  await page.getByRole("button", { name: "Vrátit se do hry" }).click();
  await page.getByRole("button", { name: "😈 Zlo" }).click();
  await expect.poll(() => sql("select winner from games where session_id = $1", [sessionId])).toEqual([{ winner: "evil" }]);

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
  await page.getByRole("textbox", { name: "Jméno hráče" }).fill("Olga");
  await page.getByRole("button", { name: "Přidat", exact: true }).click();
  await stored((st) => st.seats.length, 3);
  await second.getByRole("textbox", { name: "Jméno hráče" }).fill("Zbyněk");
  await second.getByRole("button", { name: "Přidat", exact: true }).click();
  await expect(second.getByTestId("save-status")).toHaveText("Neuloženo");
  await second.getByRole("button", { name: "Načíst uloženou verzi" }).click();
  await expect(second.getByTestId("seat")).toHaveCount(3);
  await expect(second.locator("[data-seat=Olga]")).toBeVisible();

  // ended: everyone may look, nobody else may change it
  await page.getByRole("tab", { name: "Hra" }).click();
  await expect(page.getByTestId("game-panel")).toContainText("Grimoár nemá termín");
  await page.getByRole("button", { name: "Nevím" }).click();
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
  await page.getByTestId("seat").first().click();
  await page.getByTestId("seat-panel").getByRole("button", { name: "🚪 Dveře" }).click();
  await expect(page.getByTestId("gap")).toHaveCount(2);
  await expect(page.getByTestId("town")).toContainText("Živí 5 z 5");

  // a script pasted as JSON; what the site does not know is said and left out
  await page.getByRole("tab", { name: "Příprava" }).click();
  await page.getByRole("button", { name: "Vložit JSON nebo soubor" }).click();
  await page.getByRole("textbox", { name: "Vložit JSON nebo soubor" }).fill(
    JSON.stringify([{ id: "_meta", name: "Malý script" }, "washerwoman", "chef", "empath", "poisoner", "imp", { id: "hrdina", name: "Homebrew Hrdina" }]),
  );
  await page.getByRole("button", { name: "Použít script" }).click();
  await expect(page.locator("#grimoire-script option:checked")).toHaveText("Malý script (JSON)");
  await expect(page.getByTestId("setup-panel")).toContainText("Web nezná (v grimoáru nebudou): Homebrew Hrdina");

  // the bag, then the players draw: the grimoire hides, each taps their place
  for (const name of ["Pradlena", "Kuchař", "Empat", "Travič", "Čert"]) await page.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  await page.getByRole("button", { name: "Losování hráči" }).click();
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
  await page.getByRole("tab", { name: "Hra" }).click();
  await page.getByRole("button", { name: "😇 Dobro" }).click();
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
  for (const name of ["Jana", "Petr", "Olga", "Zbyněk"]) {
    await page.getByRole("textbox", { name: "Jméno hráče" }).fill(name);
    await page.getByRole("button", { name: "Přidat", exact: true }).click();
  }
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
});

test("grimoire: the bag counts each team against the setup for the players, also over the whole screen", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 }); // a tablet on its side
  const sessionId = await sessionWithPlayers(["Ada", "Bára", "Cyril", "Dan", "Eva", "Filip", "Gita"]);
  await adminLogin(page);
  await page.goto(`/admin/termin/${sessionId}`);
  await page.getByRole("button", { name: "Nový grimoár z tohoto termínu" }).click();
  await expect(page.getByTestId("seat")).toHaveCount(7);
  const count = (scope: Page | Locator, team: string) => scope.locator(`[data-team=${team}] [data-testid=bag-team-count]`);
  await expect(count(page, "townsfolk")).toHaveText("0 / 5");

  await page.getByRole("button", { name: "Na celou obrazovku" }).click();
  const screen = page.getByTestId("bag-screen");
  await expect(screen).toContainText("Rozložení pro 7 hráčů");
  for (const name of ["Pradlena", "Empat", "Mnich", "Strážkyně krkavců", "Panna", "Travič", "Baron"]) {
    await screen.getByRole("button", { name: `Do pytlíku: ${name}` }).click();
  }
  await expect(screen.locator("h2")).toHaveText("Pytlík: 7 z 7");
  await expect(count(screen, "townsfolk")).toHaveText("5 / 5");
  await expect(count(screen, "outsider")).toHaveText("0 / 0");
  await expect(count(screen, "minion")).toHaveText("2 / 1");
  await expect(count(screen, "demon")).toHaveText("0 / 1");
  await expect(screen).toContainText("Baron: [+2 Podivíni]");
  await expect(screen.getByTestId("bag-summary-count")).toHaveText(["5 / 5", "0 / 0", "2 / 1", "0 / 1"]);
  // the whole script on the tablet without scrolling
  expect(await screen.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);

  // the Imp instead of the Baron, handed out from the full screen, which then closes
  await screen.getByRole("button", { name: "Do pytlíku: Baron" }).click();
  await screen.getByRole("button", { name: "Do pytlíku: Čert" }).click();
  await expect(count(screen, "demon")).toHaveText("1 / 1");
  await screen.getByRole("button", { name: "Rozdat náhodně" }).click();
  await expect(screen).toHaveCount(0);
  await expect(page.getByTestId("town")).not.toContainText("bez postavy");
});
