import type {
  AdminUser,
  Draft,
  DraftPick,
  DraftPool,
  DraftSession,
  DraftSessionMember,
  DraftSessionOption,
} from "@/db/schema";
import { drafterCanPick, type OptionState } from "./engine";
import { draftModes, type ModeProblem, type PoolState } from "./modes";
import { buildOptions, resolveRoleSource, totalRoles, type OptionsResult } from "./roles";

/*
 * What a session looks like now, derived from its rows. Pure, so the server computes it the same way inside
 * the transaction of a pick as on the page; the browser only shows it.
 */

export type SessionRows = {
  session: DraftSession;
  draft: Draft;
  members: DraftSessionMember[];
  options: DraftSessionOption[];
  pools: DraftPool[];
  picks: DraftPick[];
};

/** Members who draft and have not declined, in their order. */
export function drafters(members: DraftSessionMember[]) {
  return members
    .filter((m) => m.drafts && m.status !== "declined")
    .sort((a, b) => (a.seat ?? Infinity) - (b.seat ?? Infinity) || a.id - b.id);
}

export type PoolView = PoolState & { roleIds: string[] };

export type Runtime = {
  /** Drafters in their order (fixed once the session has started) */
  order: DraftSessionMember[];
  pools: PoolView[];
  /** Options nobody has picked yet, in their order */
  available: OptionState[];
  /** Characters of the picked options – gone for everybody in this session */
  pickedRoleIds: Set<string>;
  /** Total number of characters in all pools */
  drafted: number;
  current: DraftSessionMember | null;
};

export function runtime(rows: SessionRows): Runtime {
  const taken = new Set(rows.picks.map((p) => p.optionId));
  const available = rows.options
    .filter((o) => !taken.has(o.id))
    .sort((a, b) => a.position - b.position)
    .map((o) => ({ id: o.id, roleIds: o.roleIds }));
  const contents = new Map<number, string[]>();
  for (const p of [...rows.picks].sort((a, b) => a.pickNumber - b.pickNumber)) {
    contents.set(p.poolId, [...(contents.get(p.poolId) ?? []), ...p.roleIds]);
  }
  const pools = rows.pools
    .map((p) => {
      const roleIds = contents.get(p.id) ?? [];
      return { id: p.id, memberId: p.memberId, target: p.target, count: roleIds.length, roleIds };
    })
    .sort((a, b) => a.id - b.id);
  return {
    order: drafters(rows.members),
    pools,
    available,
    pickedRoleIds: new Set(rows.picks.flatMap((p) => p.roleIds)),
    drafted: pools.reduce((n, p) => n + p.count, 0),
    current: rows.members.find((m) => m.id === rows.session.currentMemberId) ?? null,
  };
}

/** Whether the member could pick something now, if it were their turn (pool not full, something fits). */
export function memberCanPick(rows: SessionRows, rt: Runtime, memberId: number) {
  return drafterCanPick(draftModes[rows.session.mode], memberId, rt.pools, rt.available);
}

/** One thing checked before a session may start. */
export type StartCheck =
  | { kind: "drafters"; ok: boolean; count: number; min: number }
  | { kind: "accepted"; ok: boolean; pending: string[] }
  | { kind: "mode"; ok: boolean }
  | { kind: "roles"; ok: boolean; problem: ModeProblem | null; offered: number }
  | { kind: "bundles"; ok: true; incomplete: OptionsResult["incompleteBundles"] };

/** Stored "preparing" shown as one of three: still being set up, waiting for answers, or ready to start. */
export type PrepState = "draft" | "waiting" | "ready";

export type StartReview = {
  checks: StartCheck[];
  ready: boolean;
  prepState: PrepState;
  /** What the session would offer if it started now */
  offer: OptionsResult;
};

/**
 * The conditions for starting: enough drafters, all of them accepted, the mode allowed by the Draft, enough
 * characters for the mode. Incomplete bundles do not stop the start, they are only pointed out.
 */
export function startReview(rows: SessionRows): StartReview {
  const { session, draft, members } = rows;
  const mode = draftModes[session.mode];
  const order = drafters(members);
  const offer = buildOptions(resolveRoleSource(draft.roleSource), draft.bundles);
  const offered = totalRoles(offer.options);
  const pending = order.filter((m) => m.status === "invited");
  const problems = mode.startProblems(session.modeConfig, order.length, offered);
  const checks: StartCheck[] = [
    { kind: "drafters", ok: order.length >= mode.minDrafters, count: order.length, min: mode.minDrafters },
    { kind: "accepted", ok: pending.length === 0, pending: pending.map((m) => m.nickname) },
    { kind: "mode", ok: draft.modes.includes(session.mode) },
    { kind: "roles", ok: problems.length === 0, problem: problems[0] ?? null, offered },
  ];
  if (offer.incompleteBundles.length) checks.push({ kind: "bundles", ok: true, incomplete: offer.incompleteBundles });
  const ready = checks.every((c) => c.ok);
  const prepState: PrepState = ready ? "ready" : members.some((m) => m.status === "invited") ? "waiting" : "draft";
  return { checks, ready, prepState, offer };
}

/** What the signed-in account may do with a session. */
export type SessionAccess = {
  /** Their own membership (any answer) */
  member: DraftSessionMember | null;
  view: boolean;
  /** Invite, order, settings, start – owner and organizers who accepted */
  manage: boolean;
  /** Cancel – managers, and the Draft's owner and administrators as a way out of a stuck session */
  cancel: boolean;
  /** Takes part in the picks */
  drafter: boolean;
};

export function isDraftManager(user: AdminUser, draft: Draft) {
  return user.role === "admin" || draft.ownerId === user.id;
}

export function sessionAccess(user: AdminUser, draft: Draft, members: DraftSessionMember[]): SessionAccess {
  const member = members.find((m) => m.userId === user.id) ?? null;
  const accepted = member?.status === "accepted";
  const manage = accepted && (member.role === "owner" || member.role === "organizer");
  const draftManager = isDraftManager(user, draft);
  return {
    member,
    view: draftManager || (member !== null && member.status !== "declined"),
    manage,
    cancel: manage || draftManager,
    drafter: accepted && member.drafts,
  };
}
