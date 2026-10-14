import type { BoardProfile } from "./types";

/**
 * Profily rozložení. Poměr agentů/civilistů/vrahů je konfigurace, ne součást algoritmu.
 * Zlaté (Gold) VIP režimy aplikace Codenames podle https://codenames.miraheze.org/wiki/VIP_Modes
 * (počty civilistů wiki neuvádí, jsou dopočtené do velikosti plochy).
 */

/** Big Mines: 7×6, agenti 15/13, 3 vrazi. https://codenames.miraheze.org/wiki/Big_Mines */
export const GOLD_BIG_MINES: BoardProfile = {
  width: 7,
  height: 6,
  primaryAgentCount: 15,
  secondaryAgentCount: 13,
  civilianCount: 11,
  assassinCount: 3,
};

/**
 * Ultimate Mirrors: 7×7, agenti 18/16, 1 vrah, agenti souměrní podle svislé, vodorovné
 * nebo úhlopříčné osy. https://codenames.miraheze.org/wiki/Ultimate_Mirrors
 */
export const GOLD_ULTIMATE_MIRRORS: BoardProfile = {
  width: 7,
  height: 7,
  primaryAgentCount: 18,
  secondaryAgentCount: 16,
  civilianCount: 14,
  assassinCount: 1,
  mirror: {
    axes: ["VERTICAL", "HORIZONTAL", "DIAGONAL", "ANTI_DIAGONAL"],
    equalOnAxisCount: true,
  },
};

/** Klasické Krycí jména 5×5 – užitečné pro testy a srovnání. */
export const CLASSIC_5X5: BoardProfile = {
  width: 5,
  height: 5,
  primaryAgentCount: 9,
  secondaryAgentCount: 8,
  civilianCount: 7,
  assassinCount: 1,
};

export const PROFILES = {
  GOLD_BIG_MINES,
  GOLD_ULTIMATE_MIRRORS,
  CLASSIC_5X5,
} as const;

export type ProfileName = keyof typeof PROFILES;
