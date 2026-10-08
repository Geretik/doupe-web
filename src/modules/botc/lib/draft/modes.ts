import { draftModeIds, type DraftModeId } from "@/db/schema";

/*
 * Draft modes. A mode decides where a pick goes, how many characters fit there and when the draft is over;
 * the snake order, locking, bundles and history are common to all modes (modules/botc/lib/draft/engine, modules/botc/lib/draft/service).
 * A new mode = one more object here (and its labels in i18n/draft.ts); nothing else needs to know about it.
 */

/** A pool as the modes see it: whose it is (null = everybody's), how many characters it takes and has. */
export type PoolState = { id: number; memberId: number | null; target: number; count: number };

/** A pool to create when a session starts. */
export type PoolSpec = { memberId: number | null; target: number };

/** A number setting of a mode, edited in the session form. */
export type ModeField = { key: string; min: number; max: number; default: number };

export type ModeConfig = Record<string, number>;

/** Why a mode cannot start: a message key of i18n/draft.ts with the numbers for it. */
export type ModeProblem =
  | { kind: "notEnoughRoles"; needed: number; offered: number }
  | { kind: "tooFewDrafters"; min: number };

export interface DraftMode {
  id: DraftModeId;
  fields: readonly ModeField[];
  /** The fewest drafters the mode is played with */
  minDrafters: number;
  startProblems(config: ModeConfig, drafters: number, offeredRoles: number): ModeProblem[];
  /** Pools for the drafters in their order */
  createPools(config: ModeConfig, drafterIds: number[]): PoolSpec[];
  /** The pool a drafter's pick goes to */
  poolOf(memberId: number, pools: PoolState[]): PoolState | undefined;
  /** Every pool that has to be filled is full */
  isComplete(pools: PoolState[]): boolean;
}

/** A pick fits when all its characters fit – a two-character bundle does not fit 14 / 15. */
export function fits(pool: PoolState, roleCount: number) {
  return pool.count + roleCount <= pool.target;
}

/** Each drafter fills a pool of their own; their picks are gone for the others of the same session. */
const personal: DraftMode = {
  id: "personal",
  fields: [{ key: "rolesPerParticipant", min: 1, max: 60, default: 15 }],
  minDrafters: 2,
  startProblems(config, drafters, offeredRoles) {
    const needed = config.rolesPerParticipant * drafters;
    return offeredRoles < needed ? [{ kind: "notEnoughRoles", needed, offered: offeredRoles }] : [];
  },
  createPools(config, drafterIds) {
    return drafterIds.map((memberId) => ({ memberId, target: config.rolesPerParticipant }));
  },
  poolOf(memberId, pools) {
    return pools.find((p) => p.memberId === memberId);
  },
  isComplete(pools) {
    return pools.every((p) => p.count >= p.target);
  },
};

/** Everybody picks into one pool until it has the target number of characters. */
const shared: DraftMode = {
  id: "shared",
  fields: [{ key: "targetRoles", min: 1, max: 200, default: 30 }],
  minDrafters: 2,
  startProblems(config, _drafters, offeredRoles) {
    const needed = config.targetRoles;
    return offeredRoles < needed ? [{ kind: "notEnoughRoles", needed, offered: offeredRoles }] : [];
  },
  createPools(config) {
    return [{ memberId: null, target: config.targetRoles }];
  },
  poolOf(_memberId, pools) {
    return pools[0];
  },
  isComplete(pools) {
    return pools.every((p) => p.count >= p.target);
  },
};

export const draftModes: Record<DraftModeId, DraftMode> = { personal, shared };

export function isDraftMode(v: unknown): v is DraftModeId {
  return typeof v === "string" && (draftModeIds as readonly string[]).includes(v);
}

/** The mode's settings with every field present and in range; values from `input` where they are valid. */
export function normalizeModeConfig(mode: DraftMode, input: Partial<Record<string, unknown>> = {}): ModeConfig {
  const config: ModeConfig = {};
  for (const f of mode.fields) {
    const n = Number(input[f.key]);
    config[f.key] = Number.isInteger(n) && n >= f.min && n <= f.max ? n : f.default;
  }
  return config;
}

/** Settings from a form: field "<mode>.<key>"; the fields that are not whole numbers in range. */
export function parseModeConfig(mode: DraftMode, formData: FormData): { config: ModeConfig; invalid: ModeField[] } {
  const config: ModeConfig = {};
  const invalid: ModeField[] = [];
  for (const f of mode.fields) {
    const raw = String(formData.get(`${mode.id}.${f.key}`) ?? "").trim();
    const n = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
    if (Number.isInteger(n) && n >= f.min && n <= f.max) config[f.key] = n;
    else invalid.push(f);
  }
  return { config, invalid };
}
