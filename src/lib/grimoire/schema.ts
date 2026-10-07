import { z } from "zod";
import { gameWinners } from "@/db/schema";
import { BLUFF_COUNT, findRole } from "@/lib/botc-roles";
import { gapKinds, MAX_REMINDERS, MAX_SEATS, type GrimoireState } from "./state";

const roleId = z.string().max(40).refine((id) => findRole(id) !== undefined);
const shortId = z.string().min(1).max(20);

/** A grimoire state as the page sends it: only known characters, bounded sizes, unknown fields dropped. */
export const grimoireStateSchema: z.ZodType<GrimoireState> = z.object({
  script: z.object({
    id: z.number().int().positive().nullable(),
    json: z.boolean().optional(),
    name: z.string().trim().min(1).max(200),
    roleIds: z.array(roleId).max(300),
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
          .array(z.object({ id: shortId, roleId: roleId.nullable(), text: z.string().trim().min(1).max(80) }))
          .max(MAX_REMINDERS),
      }),
    )
    .max(MAX_SEATS),
  bag: z.array(roleId).max(MAX_SEATS),
  bluffs: z.array(roleId.nullable()).length(BLUFF_COUNT),
  phase: z.enum(["setup", "night", "day", "ended"]),
  round: z.number().int().min(0).max(99),
  winner: z.enum(gameWinners).nullable(),
  nightDone: z.array(z.string().max(40)).max(200),
  drawing: z.boolean().optional(),
});
