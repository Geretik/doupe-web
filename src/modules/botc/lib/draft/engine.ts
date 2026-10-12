import { fits, type DraftMode, type ModeConfig, type OptionState, type PickBlock, type PoolState } from "./modes";

/*
 * The snake turn order, common to all modes. Pure functions: the server runs them inside the transaction
 * that locked the session (modules/botc/lib/draft/service) and saves the result; the browser never decides a turn.
 */

export type Turn = { seat: number; direction: 1 | -1 };

/**
 * The turn after `turn` among `seats` drafters: 1 → 2 → … → N, then N again and back to 1, then 1 again and on.
 * At either end the same drafter picks twice in a row, in the other direction.
 */
export function snakeStep(turn: Turn, seats: number): Turn {
  const next = turn.seat + turn.direction;
  if (next < 0 || next >= seats) return { seat: turn.seat, direction: turn.direction === 1 ? -1 : 1 };
  return { seat: next, direction: turn.direction };
}

/** The first `count` seats of the snake order, from the start – for tests and for showing the order. */
export function snakeOrder(seats: number, count: number): number[] {
  const order: number[] = [];
  let turn: Turn = { seat: 0, direction: 1 };
  for (let i = 0; i < count; i++) {
    order.push(turn.seat);
    turn = snakeStep(turn, seats);
  }
  return order;
}

/**
 * The next turn in snake order of a drafter who can still pick, skipping those who cannot (their pool is full,
 * or nothing left fits it). Null when nobody can. Two rounds there and back are enough to meet every seat.
 */
export function nextTurn(turn: Turn, seats: number, canPick: (seat: number) => boolean): Turn | null {
  let t = turn;
  for (let i = 0; i < 2 * seats; i++) {
    t = snakeStep(t, seats);
    if (canPick(t.seat)) return t;
  }
  return null;
}

/** The first turn: the first drafter in the order who can pick, going forwards. */
export function firstTurn(seats: number, canPick: (seat: number) => boolean): Turn | null {
  for (let seat = 0; seat < seats; seat++) if (canPick(seat)) return { seat, direction: 1 };
  return null;
}

export type { OptionState };

/** Whether the drafter may take the option now: "ok", it does not fit their pool, or a rule of the mode keeps them from it. */
export function pickCheck(
  mode: DraftMode,
  config: ModeConfig,
  memberId: number,
  option: OptionState,
  pools: PoolState[],
  available: OptionState[],
): "ok" | "doesNotFit" | PickBlock {
  const pool = mode.poolOf(memberId, pools);
  if (!pool || !fits(pool, option.roleIds.length)) return "doesNotFit";
  return mode.blocked?.(config, memberId, option, pools, available) ?? "ok";
}

/** Whether the drafter has anything left they may take. */
export function drafterCanPick(mode: DraftMode, config: ModeConfig, memberId: number, pools: PoolState[], available: OptionState[]) {
  return available.some((o) => pickCheck(mode, config, memberId, o, pools, available) === "ok");
}

export type AfterPick =
  | { kind: "next"; turn: Turn; memberId: number }
  /** the mode's goal is reached, or nobody can pick anything any more */
  | { kind: "completed"; exhausted: boolean };

/**
 * What follows a pick: the pools and options are those after it. The draft ends when the mode says so, or when
 * nothing left fits anybody (e.g. only bundles remain and every pool has one place left). A drafter whom the mode's
 * rules keep from everything left (the cap) is skipped like one whose pool is full.
 */
export function afterPick(
  mode: DraftMode,
  config: ModeConfig,
  turn: Turn,
  drafterIds: number[],
  pools: PoolState[],
  available: OptionState[],
): AfterPick {
  if (mode.isComplete(pools)) return { kind: "completed", exhausted: false };
  const next = nextTurn(turn, drafterIds.length, (seat) => drafterCanPick(mode, config, drafterIds[seat], pools, available));
  if (!next) return { kind: "completed", exhausted: true };
  return { kind: "next", turn: next, memberId: drafterIds[next.seat] };
}
