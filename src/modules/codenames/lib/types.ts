/*
 * modules/codenames/lib: the generator of the print tool for Krycí jména (../mines-generator, src/), copied as it is
 * (only the imports lose ".ts"). Keep it in step with the tool: the same set code, mode and starting team must give
 * the same cards here as on paper (tests/e2e/codenames.spec.ts compares them), so the RNG and the order it is
 * consumed in must not change.
 */
/** Tým. "primary" v konfiguraci se mapuje na startingTeam, nikdy napevno na barvu. */
export type Team = "RED" | "BLUE";

/** Volba startovního týmu v konfiguraci. */
export type TeamChoice = Team | "RANDOM";

/** Skutečná role pole. Interně pracujeme rovnou s barvami týmů. */
export type CardType = "RED_AGENT" | "BLUE_AGENT" | "CIVILIAN" | "ASSASSIN";

/**
 * Osa souměrnosti pro zrcadlové režimy (Mirrors), pojmenovaná podle směru samotné osy.
 * Souřadnice: x roste doprava, y dolů (řádek 0 je nahoře).
 * - VERTICAL:      svislá osa, (x, y) -> (w-1-x, y)
 * - HORIZONTAL:    vodorovná osa, (x, y) -> (x, h-1-y)
 * - DIAGONAL:      úhlopříčka SZ–JV (z levého horního rohu), (x, y) -> (y, x); jen čtverec
 * - ANTI_DIAGONAL: úhlopříčka JZ–SV (z levého dolního rohu), (x, y) -> (w-1-y, h-1-x); jen čtverec
 */
export type MirrorAxis = "VERTICAL" | "HORIZONTAL" | "DIAGONAL" | "ANTI_DIAGONAL";

/** Pravidlo zrcadlových režimů: agenti každého týmu jsou souměrní podle právě jedné osy. */
export interface MirrorRule {
  /** Osy, ze kterých se losuje. Každý tým má svou osu, týmy mohou mít stejnou i různou. */
  axes: MirrorAxis[];
  /** Oba týmy mají na své ose stejný počet agentů (nezdokumentované pravidlo aplikace podle wiki). */
  equalOnAxisCount: boolean;
}

/** Profil rozložení: kolik čeho je na desce. Součet musí sedět s width × height. */
export interface BoardProfile {
  width: number;
  height: number;
  primaryAgentCount: number;
  secondaryAgentCount: number;
  civilianCount: number;
  assassinCount: number;
  /** Zrcadlový režim. Bez něj je rozložení čistě náhodné. */
  mirror?: MirrorRule;
}

/** Vstupní konfigurace generátoru. */
export interface BoardConfig extends BoardProfile {
  /** Který tým je "primary" (má primaryAgentCount agentů a začíná). */
  primaryTeam: TeamChoice;
  /** Libovolný řetězec. Stejná konfigurace + seed => identická deska. */
  seed?: string;
}

/** SECRET DATA – plná informace o jednom poli. */
export interface Card {
  x: number;
  y: number;
  type: CardType;
  /** Počet RED_AGENT na max. 8 sousedních polích (bez tohoto pole). */
  adjacentRedAgents: number;
  /** Počet BLUE_AGENT na max. 8 sousedních polích (bez tohoto pole). */
  adjacentBlueAgents: number;
}

/** SECRET DATA – kompletní vygenerovaná deska. */
export interface GeneratedBoard {
  width: number;
  height: number;
  startingTeam: Team;
  seed: string;
  /** Jen u zrcadlových režimů: osa souměrnosti agentů každého týmu. */
  mirrorAxes?: Record<Team, MirrorAxis>;
  cards: Card[];
}

/** PLAYER VISIBLE DATA – co smí vidět operativec. Neodkryté pole nenese žádnou tajnou informaci. */
export type VisibleCard =
  | { x: number; y: number; revealed: false }
  | {
      x: number;
      y: number;
      revealed: true;
      type: CardType;
      adjacentRedAgents: number;
      adjacentBlueAgents: number;
    };

export interface PlayerVisibleBoard {
  width: number;
  height: number;
  startingTeam: Team;
  cards: VisibleCard[];
}
