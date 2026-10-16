import type {
  BoardConfig,
  BoardProfile,
  Card,
  CardType,
  GeneratedBoard,
  MirrorAxis,
  PlayerVisibleBoard,
  Team,
  VisibleCard,
} from "./types";
import { createRng, randomSeed, shuffleInPlace, type Rng } from "./rng";
import { countOnAxis, generateMirrorLayout, mirrorRuleProblem, symmetryAxes } from "./mirror";

export class BoardConfigError extends Error {
  override name = "BoardConfigError";
}

export class BoardValidationError extends Error {
  override name = "BoardValidationError";
}

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

function assertInt(name: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new BoardConfigError(`${name} musí být celé číslo >= ${min}, dostal ${value}`);
  }
}

/** Ověří konfiguraci. Součet rolí musí přesně odpovídat width × height. */
export function validateConfig(config: BoardConfig): void {
  assertInt("width", config.width, 1);
  assertInt("height", config.height, 1);
  assertInt("primaryAgentCount", config.primaryAgentCount, 0);
  assertInt("secondaryAgentCount", config.secondaryAgentCount, 0);
  assertInt("civilianCount", config.civilianCount, 0);
  assertInt("assassinCount", config.assassinCount, 0);

  const total = config.width * config.height;
  const sum =
    config.primaryAgentCount +
    config.secondaryAgentCount +
    config.civilianCount +
    config.assassinCount;
  if (sum !== total) {
    throw new BoardConfigError(
      `Součet rolí (${sum}) neodpovídá velikosti plochy ${config.width}×${config.height} = ${total}`,
    );
  }

  if (config.primaryTeam !== "RED" && config.primaryTeam !== "BLUE" && config.primaryTeam !== "RANDOM") {
    throw new BoardConfigError(
      `primaryTeam musí být RED, BLUE nebo RANDOM, dostal ${String(config.primaryTeam)}`,
    );
  }

  if (config.mirror) {
    const problem = mirrorRuleProblem(
      config.mirror,
      config.width,
      config.height,
      config.primaryAgentCount,
      config.secondaryAgentCount,
    );
    if (problem) throw new BoardConfigError(`Zrcadlový režim: ${problem}`);
  }
}

/** Pomocník: z profilu udělá konfiguraci. */
export function configFromProfile(
  profile: BoardProfile,
  primaryTeam: BoardConfig["primaryTeam"],
  seed?: string,
): BoardConfig {
  return { ...profile, primaryTeam, seed };
}

/** Sousedé pole (max. 8), pole mimo plochu vynechána. */
export function neighborsOf(x: number, y: number, width: number, height: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) out.push([nx, ny]);
  }
  return out;
}

/** Spočítá Mines hodnoty pro dané pole z mřížky typů (index = y * width + x). */
export function countAdjacentAgents(
  types: ReadonlyArray<CardType>,
  width: number,
  height: number,
  x: number,
  y: number,
): { adjacentRedAgents: number; adjacentBlueAgents: number } {
  let red = 0;
  let blue = 0;
  for (const [nx, ny] of neighborsOf(x, y, width, height)) {
    const t = types[ny * width + nx];
    if (t === "RED_AGENT") red++;
    else if (t === "BLUE_AGENT") blue++;
  }
  return { adjacentRedAgents: red, adjacentBlueAgents: blue };
}

/** Z plochého seznamu typů (row-major, index = y * width + x) postaví karty včetně Mines hodnot. */
export function buildCards(types: ReadonlyArray<CardType>, width: number, height: number): Card[] {
  if (types.length !== width * height) {
    throw new BoardConfigError(`Počet typů (${types.length}) neodpovídá ${width}×${height}`);
  }
  const cards: Card[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cards.push({
        x,
        y,
        type: types[y * width + x]!,
        ...countAdjacentAgents(types, width, height, x, y),
      });
    }
  }
  return cards;
}

function otherTeam(team: Team): Team {
  return team === "RED" ? "BLUE" : "RED";
}

/**
 * Hlavní vstup. Deterministický: stejná konfigurace + seed => identická deska.
 * Pořadí spotřeby RNG: (1) případný výběr startovního týmu, (2) rozložení –
 * Fisher–Yates shuffle, u zrcadlového režimu rozmístění agentů a pak shuffle zbylých polí.
 */
export function generateBoard(config: BoardConfig): GeneratedBoard {
  validateConfig(config);

  const seed = config.seed ?? randomSeed();
  const rng = createRng(seed);

  const startingTeam: Team =
    config.primaryTeam === "RANDOM" ? (rng.nextInt(2) === 0 ? "RED" : "BLUE") : config.primaryTeam;
  const secondaryTeam = otherTeam(startingTeam);

  const primaryType: CardType = `${startingTeam}_AGENT`;
  const secondaryType: CardType = `${secondaryTeam}_AGENT`;

  let roles: CardType[];
  let mirrorAxes: Record<Team, MirrorAxis> | undefined;

  if (config.mirror) {
    ({ roles, mirrorAxes } = mirroredRoles(config, startingTeam, rng));
  } else {
    roles = [
      ...Array<CardType>(config.primaryAgentCount).fill(primaryType),
      ...Array<CardType>(config.secondaryAgentCount).fill(secondaryType),
      ...Array<CardType>(config.civilianCount).fill("CIVILIAN"),
      ...Array<CardType>(config.assassinCount).fill("ASSASSIN"),
    ];
    shuffleInPlace(roles, rng);
  }

  const board: GeneratedBoard = {
    width: config.width,
    height: config.height,
    startingTeam,
    seed,
    ...(mirrorAxes ? { mirrorAxes } : {}),
    cards: buildCards(roles, config.width, config.height),
  };

  validateBoard(board, config);
  return board;
}

/** Zrcadlový režim: agenti podle os, vrazi a civilisté náhodně na zbylá pole. */
function mirroredRoles(
  config: BoardConfig,
  startingTeam: Team,
  rng: Rng,
): { roles: CardType[]; mirrorAxes: Record<Team, MirrorAxis> } {
  const layout = generateMirrorLayout(
    config.width,
    config.height,
    config.primaryAgentCount,
    config.secondaryAgentCount,
    config.mirror!,
    rng,
  );
  if (!layout) {
    throw new BoardConfigError("Zrcadlový režim: pro tyto počty agentů a osy se nepodařilo najít rozložení");
  }

  const secondaryTeam = otherTeam(startingTeam);
  const roles = Array<CardType>(config.width * config.height).fill("CIVILIAN");
  for (const i of layout.primary) roles[i] = `${startingTeam}_AGENT`;
  for (const i of layout.secondary) roles[i] = `${secondaryTeam}_AGENT`;

  const rest = shuffleInPlace(
    roles.flatMap((t, i) => (t === "CIVILIAN" ? [i] : [])),
    rng,
  );
  for (const i of rest.slice(0, config.assassinCount)) roles[i] = "ASSASSIN";

  return {
    roles,
    mirrorAxes: { [startingTeam]: layout.primaryAxis, [secondaryTeam]: layout.secondaryAxis } as Record<Team, MirrorAxis>,
  };
}

/** Očekávané počty typů pro danou konfiguraci a startovní tým. */
export function expectedCounts(config: BoardProfile, startingTeam: Team): Record<CardType, number> {
  return {
    RED_AGENT: startingTeam === "RED" ? config.primaryAgentCount : config.secondaryAgentCount,
    BLUE_AGENT: startingTeam === "BLUE" ? config.primaryAgentCount : config.secondaryAgentCount,
    CIVILIAN: config.civilianCount,
    ASSASSIN: config.assassinCount,
  };
}

export function countTypes(cards: ReadonlyArray<Card>): Record<CardType, number> {
  const counts: Record<CardType, number> = { RED_AGENT: 0, BLUE_AGENT: 0, CIVILIAN: 0, ASSASSIN: 0 };
  for (const c of cards) counts[c.type]++;
  return counts;
}

/**
 * Nezávislá kontrola hotové desky: rozměry, unikátní a kompletní pozice,
 * počty typů a přepočet všech Mines hodnot přímo ze sousedů.
 */
export function validateBoard(board: GeneratedBoard, config: BoardProfile): void {
  const { width, height, cards } = board;
  const total = width * height;

  if (cards.length !== total) {
    throw new BoardValidationError(`Počet polí ${cards.length} != ${width}×${height} = ${total}`);
  }

  const seen = new Set<number>();
  for (const c of cards) {
    if (
      !Number.isInteger(c.x) || !Number.isInteger(c.y) ||
      c.x < 0 || c.x >= width || c.y < 0 || c.y >= height
    ) {
      throw new BoardValidationError(`Pozice (${c.x},${c.y}) leží mimo plochu`);
    }
    const key = c.y * width + c.x;
    if (seen.has(key)) throw new BoardValidationError(`Pozice (${c.x},${c.y}) se opakuje`);
    seen.add(key);
  }
  if (seen.size !== total) throw new BoardValidationError("Některá pozice je prázdná");

  const actual = countTypes(cards);
  const expected = expectedCounts(config, board.startingTeam);
  for (const type of Object.keys(expected) as CardType[]) {
    if (actual[type] !== expected[type]) {
      throw new BoardValidationError(`Počet ${type}: ${actual[type]}, očekáváno ${expected[type]}`);
    }
  }

  const types: CardType[] = new Array(total);
  for (const c of cards) types[c.y * width + c.x] = c.type;

  for (const c of cards) {
    const r = countAdjacentAgents(types, width, height, c.x, c.y);
    if (c.adjacentRedAgents !== r.adjacentRedAgents || c.adjacentBlueAgents !== r.adjacentBlueAgents) {
      throw new BoardValidationError(
        `Mines hodnoty na (${c.x},${c.y}) nesedí: R${c.adjacentRedAgents}/B${c.adjacentBlueAgents}` +
          ` vs. přepočet R${r.adjacentRedAgents}/B${r.adjacentBlueAgents}`,
      );
    }
    for (const v of [c.adjacentRedAgents, c.adjacentBlueAgents]) {
      if (v < 0 || v > 8) {
        throw new BoardValidationError(`Mines hodnota ${v} mimo rozsah 0..8 na (${c.x},${c.y})`);
      }
    }
  }

  if (config.mirror) validateMirror(board, types, config.mirror.axes, config.mirror.equalOnAxisCount);
}

/** Zrcadlový režim: agenti každého týmu souměrní podle právě jedné z povolených os, a to té uvedené v desce. */
function validateMirror(
  board: GeneratedBoard,
  types: ReadonlyArray<CardType>,
  allowedAxes: readonly MirrorAxis[],
  equalOnAxisCount: boolean,
): void {
  const { width, height, mirrorAxes } = board;
  if (!mirrorAxes) throw new BoardValidationError("Zrcadlová deska nemá uvedené osy týmů");

  const onAxis: number[] = [];
  for (const team of ["RED", "BLUE"] as const) {
    const cells = new Set(types.flatMap((t, i) => (t === `${team}_AGENT` ? [i] : [])));
    const axes = symmetryAxes(cells, allowedAxes, width, height);
    if (axes.length !== 1 || axes[0] !== mirrorAxes[team]) {
      throw new BoardValidationError(
        `Agenti týmu ${team} mají být souměrní právě podle osy ${mirrorAxes[team]}, jsou podle [${axes.join(", ")}]`,
      );
    }
    onAxis.push(countOnAxis(cells, mirrorAxes[team], width, height));
  }
  if (equalOnAxisCount && onAxis[0] !== onAxis[1]) {
    throw new BoardValidationError(`Týmy mají na své ose různý počet agentů: ${onAxis[0]} vs. ${onAxis[1]}`);
  }
}

/** Najde kartu na pozici. */
export function cardAt(board: GeneratedBoard, x: number, y: number): Card | undefined {
  return board.cards.find((c) => c.x === x && c.y === y);
}

/**
 * Oddělení SECRET DATA od PLAYER VISIBLE DATA.
 * Vrátí pohled operativce: neodkrytá pole nesou pouze souřadnice.
 * `revealed` je množina klíčů ve tvaru "x,y".
 */
export function toPlayerView(board: GeneratedBoard, revealed: ReadonlySet<string>): PlayerVisibleBoard {
  const cards: VisibleCard[] = board.cards.map((c) =>
    revealed.has(`${c.x},${c.y}`)
      ? {
          x: c.x,
          y: c.y,
          revealed: true,
          type: c.type,
          adjacentRedAgents: c.adjacentRedAgents,
          adjacentBlueAgents: c.adjacentBlueAgents,
        }
      : { x: c.x, y: c.y, revealed: false },
  );
  return { width: board.width, height: board.height, startingTeam: board.startingTeam, cards };
}
