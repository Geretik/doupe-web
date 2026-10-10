"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAction } from "@/lib/admin-log";
import { normalizeBarcode } from "@/lib/barcode";
import { assignBarcode, cleanName, findGame, lendGame, removeBarcode, returnLoan } from "@/lib/loans";
import { parseId } from "@/lib/validation";

/** What the desk shows after an action: `message` when it went through, `error` when not. */
export type LoanActionResult = { ok: true; message: string } | { ok: false; error: string };

const PAGE = "/admin/pujcovna";

const lendSchema = z.object({
  gameId: z.number().int().positive(),
  borrower: z.string().transform(cleanName).pipe(z.string().min(1).max(200)),
  note: z.string().trim().max(500).optional(),
});

/** Admin → Půjčovna: lends a game of the collection to someone. */
export async function lendGameAction(input: { gameId: number; borrower: string; note?: string }): Promise<LoanActionResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const l = t.admin.loans;
  const parsed = lendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "borrower") ? l.fillBorrower : t.admin.errors.checkForm };
  const game = findGame(parsed.data.gameId);
  if (!game) return { ok: false, error: l.noGame };
  const { borrower, note } = parsed.data;
  const outcome = await lendGame(game, borrower, note || null, me.id);
  if (outcome.status === "already") return { ok: false, error: l.alreadyLent(game.name, outcome.loan?.borrower ?? null) };
  // who borrowed it stays out of the log, like a name on the attendance sheet
  await logAction(me, "loan.lend", { game: { id: game.id, name: game.name } });
  revalidatePath(PAGE);
  return { ok: true, message: l.lent(game.name, borrower) };
}

/** The game of an open loan came back. */
export async function returnLoanAction(loanId: number): Promise<LoanActionResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const id = parseId(loanId);
  const loan = id ? await returnLoan(id, me.id) : undefined;
  revalidatePath(PAGE);
  if (!loan) return { ok: false, error: t.admin.loans.notLent };
  await logAction(me, "loan.return", { game: { id: loan.gameId, name: loan.gameName } });
  return { ok: true, message: t.admin.loans.returned(loan.gameName) };
}

/** The bar code read from a box belongs to this game; scanning it again finds the game. */
export async function assignBarcodeAction(input: { code: string; gameId: number }): Promise<LoanActionResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const l = t.admin.loans;
  const code = typeof input?.code === "string" ? normalizeBarcode(input.code) : null;
  if (!code) return { ok: false, error: l.badCode };
  const game = findGame(Number(input.gameId));
  if (!game) return { ok: false, error: l.noGame };
  await assignBarcode(code, game.id, me.id);
  await logAction(me, "loan.code", { game: { id: game.id, name: game.name }, code });
  revalidatePath(PAGE);
  return { ok: true, message: l.codeSaved(code, game.name) };
}

/** Forgets a code given to the wrong game. */
export async function removeBarcodeAction(input: { code: string }): Promise<LoanActionResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const l = t.admin.loans;
  const code = typeof input?.code === "string" ? normalizeBarcode(input.code) : null;
  const row = code ? await removeBarcode(code) : undefined;
  revalidatePath(PAGE);
  if (!row) return { ok: false, error: l.codeGone };
  const game = findGame(row.gameId);
  await logAction(me, "loan.codeRemove", { game: { id: row.gameId, name: game?.name ?? String(row.gameId) }, code: row.code });
  return { ok: true, message: l.codeRemoved(row.code) };
}
