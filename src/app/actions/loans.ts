"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDict } from "@/i18n/server";
import { requireAccess } from "@/lib/admin-auth";
import { logAction } from "@/lib/admin-log";
import { normalizeBarcode } from "@/lib/barcode";
import { assignBarcode, boxOfGame, cleanName, findGame, guessGamesByCode, lendGame, packGame, removeBarcode, returnLoan, setNoBarcode } from "@/lib/loans";
import { parseId } from "@/lib/validation";

/** What the desk shows after an action: `message` when it went through, `error` when not. */
export type LoanActionResult = { ok: true; message: string } | { ok: false; error: string };

const PAGE = "/admin/pujcovna";

const lendSchema = z.object({
  gameIds: z.array(z.number().int().positive()).min(1).max(50),
  borrower: z.string().transform(cleanName).pipe(z.string().min(1).max(200)),
  note: z.string().trim().max(500).optional(),
});

/** Admin → Půjčovna: lends games of the collection to someone, one or several at once (the boxes scanned in a row). */
export async function lendGamesAction(input: { gameIds: number[]; borrower: string; note?: string }): Promise<LoanActionResult> {
  const me = await requireAccess("club", "edit");
  const { t } = await getDict();
  const l = t.admin.loans;
  const parsed = lendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "borrower") ? l.fillBorrower : t.admin.errors.checkForm };
  const ids = [...new Set(parsed.data.gameIds)];
  const games = ids.map(findGame).filter((g) => g !== null);
  if (games.length < ids.length) return { ok: false, error: l.noGame };
  const { borrower, note } = parsed.data;
  const lent: string[] = [];
  const refused: string[] = [];
  for (const game of games) {
    const outcome = await lendGame(game, borrower, note || null, me.id);
    if (outcome.status === "already") {
      refused.push(l.alreadyLent(game.name, outcome.loan?.borrower ?? null));
      continue;
    }
    lent.push(game.name);
    // who borrowed it stays out of the log, like a name on the attendance sheet
    await logAction(me, "loan.lend", { game: { id: game.id, name: game.name } });
  }
  revalidatePath(PAGE);
  if (lent.length === 0) return { ok: false, error: refused.join(" ") };
  return { ok: true, message: [l.lent(lent, borrower), ...refused].join(" ") };
}

/** Which game of the collection an unknown code may be, by the name GameUPC gives it. */
export async function guessGameAction(input: { code: string }): Promise<{ name: string | null; gameIds: number[] }> {
  await requireAccess("club", "edit");
  const code = typeof input?.code === "string" ? normalizeBarcode(input.code) : null;
  if (!code) return { name: null, gameIds: [] };
  return guessGamesByCode(code);
}

/** The games of open loans came back: one, or a bundle lent together. */
export async function returnLoansAction(loanIds: number[]): Promise<LoanActionResult> {
  const me = await requireAccess("club", "edit");
  const { t } = await getDict();
  const ids = Array.isArray(loanIds) ? [...new Set(loanIds.slice(0, 50).map(parseId).filter((id) => id !== null))] : [];
  const returned: string[] = [];
  for (const id of ids) {
    const loan = await returnLoan(id, me.id);
    if (!loan) continue;
    returned.push(loan.gameName);
    await logAction(me, "loan.return", { game: { id: loan.gameId, name: loan.gameName } });
  }
  revalidatePath(PAGE);
  if (returned.length === 0) return { ok: false, error: t.admin.loans.notLent };
  return { ok: true, message: t.admin.loans.returned(returned) };
}

/** The box of the game (of its bundle) has no bar code: it is found by its name only; `value` false takes that back. */
export async function setNoBarcodeAction(input: { gameId: number; value: boolean }): Promise<LoanActionResult> {
  const me = await requireAccess("club", "edit");
  const { t } = await getDict();
  const l = t.admin.loans;
  const shown = findGame(Number(input?.gameId));
  const game = shown && findGame(await boxOfGame(shown.id));
  if (!game) return { ok: false, error: l.noGame };
  const value = input.value === true;
  await setNoBarcode(game.id, value, me.id);
  await logAction(me, "loan.noBarcode", { game: { id: game.id, name: game.name }, value });
  revalidatePath(PAGE);
  return { ok: true, message: value ? l.noBarcodeSaved(game.name) : l.noBarcodeRemoved(game.name) };
}

/** The game goes in the box of `box` (an expansion built into the base game) and is lent with it; null takes it out. */
export async function packGameAction(input: { gameId: number; box: number | null }): Promise<LoanActionResult> {
  const me = await requireAccess("club", "edit");
  const { t } = await getDict();
  const l = t.admin.loans;
  const game = findGame(Number(input?.gameId));
  const box = input?.box === null ? null : findGame(Number(input?.box));
  if (!game || (input.box !== null && !box)) return { ok: false, error: l.noGame };
  if (box?.id === game.id) return { ok: false, error: t.admin.errors.checkForm };
  const outcome = await packGame(game.id, box?.id ?? null, me.id);
  if (outcome === "nested") return { ok: false, error: l.packNested(game.name) };
  if (outcome === "inside") return { ok: false, error: l.packInside(box!.name) };
  await logAction(me, "loan.pack", { game: { id: game.id, name: game.name }, box: box && { id: box.id, name: box.name } });
  revalidatePath(PAGE);
  return { ok: true, message: box ? l.packed(game.name, box.name) : l.unpacked(game.name) };
}

/** The bar code read from a box belongs to this game; scanning it again finds the game. */
export async function assignBarcodeAction(input: { code: string; gameId: number }): Promise<LoanActionResult> {
  const me = await requireAccess("club", "edit");
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
  const me = await requireAccess("club", "edit");
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
