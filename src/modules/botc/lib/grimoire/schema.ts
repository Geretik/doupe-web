import { z } from "zod";
import { gameWinners } from "@/db/schema";
import { BLUFF_COUNT, findRole, findStorytellerRole, storytellerRoles } from "@/modules/botc/lib/botc-roles";
import { eventKinds, gapKinds, HOMEBREW_LIMITS, MAX_EVENTS, MAX_REMINDERS, MAX_SEATS, sides, townLayouts, type GrimoireState } from "./state";

const roleId = z.string().max(40).refine((id) => findRole(id) !== undefined);
/** A Fabled or Loric */
const fabledId = z.string().max(40).refine((id) => findStorytellerRole(id) !== undefined);
/** A character whose tokens lie in the town or whose ability did something: a player's or the Storyteller's */
const anyRoleId = z.union([roleId, fabledId]);
const fabledList = z.array(fabledId).max(storytellerRoles.length);
const homebrewText = z.string().trim().min(1).max(HOMEBREW_LIMITS.text);
const homebrew = z.object({
  rules: z.array(homebrewText).max(HOMEBREW_LIMITS.rules),
  characters: z
    .array(z.object({ name: z.string().trim().min(1).max(HOMEBREW_LIMITS.name), team: z.string().max(20).nullable(), ability: homebrewText }))
    .max(HOMEBREW_LIMITS.characters),
});
const shortId = z.string().min(1).max(20);
const round = z.number().int().min(0).max(99);
const fraction = z.number().min(0).max(1);

/** A grimoire state as the page sends it: only known characters, bounded sizes, unknown fields dropped. */
export const grimoireStateSchema: z.ZodType<GrimoireState> = z.object({
  script: z.object({
    id: z.number().int().positive().nullable(),
    json: z.boolean().optional(),
    name: z.string().trim().min(1).max(200),
    roleIds: z.array(roleId).max(300),
    fabled: fabledList.optional(),
    homebrew: homebrew.optional(),
  }),
  seats: z
    .array(
      z.object({
        id: shortId,
        gap: z.enum(gapKinds).optional(),
        name: z.string().trim().max(60),
        registrationId: z.number().int().positive().nullable(),
        role: roleId.nullable(),
        believedRole: roleId.nullable(),
        dead: z.boolean(),
        voteUsed: z.boolean(),
        reminders: z
          .array(z.object({ id: shortId, roleId: anyRoleId.nullable(), text: z.string().trim().min(1).max(80), round: round.optional() }))
          .max(MAX_REMINDERS),
        pos: z.object({ x: fraction, y: fraction }).optional(),
        side: z.enum(sides).optional(),
      }),
    )
    .max(MAX_SEATS),
  layout: z.enum(townLayouts).optional(),
  bag: z.array(roleId).max(MAX_SEATS),
  bluffs: z.array(roleId.nullable()).length(BLUFF_COUNT),
  phase: z.enum(["setup", "night", "day", "ended"]),
  round,
  winner: z.enum(gameWinners).nullable(),
  nightDone: z.array(z.string().max(40)).max(200),
  drawing: z.boolean().optional(),
  seatsLocked: z.boolean().optional(),
  // as long as the game form's note
  notes: z.string().trim().max(1000).optional(),
  log: z
    .array(
      z.object({
        round,
        day: z.boolean().optional(),
        kind: z.enum(eventKinds),
        seatId: shortId,
        name: z.string().trim().max(60),
        role: roleId.nullable(),
        by: anyRoleId.optional(),
        fake: z.boolean().optional(),
      }),
    )
    .max(MAX_EVENTS)
    .optional(),
  fabled: fabledList.optional(),
  fiddle: z.object({ demon: shortId, opponent: shortId }).optional(),
});
