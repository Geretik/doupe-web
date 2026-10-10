import { LoanDesk, type DeskGame, type DeskLoan } from "@/components/admin/loan-desk";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { collectionGames, knownPeople, lastReturnedLoans, listBarcodes, listOpenLoans, listReturnedLoans, LOAN_RETENTION_DAYS } from "@/lib/loans";
import { formatShortDate, pragueDaysBetween } from "@/lib/time";
import { parseId } from "@/lib/validation";

/**
 * Admin → Půjčovna: lending the club's games. The desk finds a game by the bar code on its box or by its name and
 * lends it or takes it back; below, the latest loans that came back. `?hra=` opens one game (links from Historie).
 */
export default async function LoansPage({ searchParams }: { searchParams: Promise<{ hra?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const [{ locale, t }, codes, open, returned, lastRows, people] = await Promise.all([
    getDict(),
    listBarcodes(),
    listOpenLoans(),
    listReturnedLoans(),
    lastReturnedLoans(),
    knownPeople(),
  ]);
  const l = t.admin.loans;
  const collection = collectionGames();
  const games: DeskGame[] = collection.map(({ id, name, year, url, expansion, note }) => ({ id, name, year, url, expansion, note }));
  const inCollection = new Set(games.map((g) => g.id));
  const now = new Date();
  const date = (d: Date) => formatShortDate(d, locale);
  const loans: DeskLoan[] = open.map((o) => {
    const days = pragueDaysBetween(o.lentAt, now);
    return {
      id: o.id,
      gameId: o.gameId,
      gameName: o.gameName,
      borrower: o.borrower,
      note: o.note,
      since: date(o.lentAt),
      age: days > 0 ? l.days(days) : l.today,
      lentBy: o.lentBy ? l.lentBy(o.lentBy) : null,
    };
  });
  const last = Object.fromEntries(
    lastRows.map((r) => [r.gameId, `${r.borrower ?? l.erased}, ${date(r.lentAt)} – ${r.returnedAt ? date(r.returnedAt) : ""}`]),
  );
  const known = new Set(codes.filter((c) => inCollection.has(c.gameId)).map((c) => c.gameId)).size;
  const requested = parseId(params.hra);
  const initialGameId = requested && inCollection.has(requested) ? requested : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{l.title}</h1>
        <p className="max-w-3xl text-sm text-muted">{l.intro(LOAN_RETENTION_DAYS)}</p>
        <p className="text-sm text-muted" data-testid="loan-codes-known">{l.codesKnown(known, games.length)}</p>
      </div>

      <Card>
        <LoanDesk
          // the game asked for in the address opens again when it changes
          key={initialGameId ?? "desk"}
          games={games}
          codes={codes}
          loans={loans}
          last={last}
          people={people}
          initialGameId={initialGameId}
          t={l.desk}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{l.returnedTitle}</h2>
        {returned.length === 0 ? (
          <p className="text-sm text-muted">{l.noReturned}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="loan-returned">
              <thead className="text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">{l.game}</th>
                  <th className="py-2 pr-3 font-medium">{l.borrower}</th>
                  <th className="py-2 pr-3 font-medium">{l.lentAt}</th>
                  <th className="py-2 pr-3 font-medium">{l.returnedAt}</th>
                  <th className="py-2 font-medium">{l.note}</th>
                </tr>
              </thead>
              <tbody>
                {returned.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{r.gameName}</td>
                    <td className="py-2 pr-3">{r.borrower ?? <span className="text-muted">{l.erased}</span>}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{date(r.lentAt)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.returnedAt && date(r.returnedAt)}</td>
                    <td className="py-2 text-muted">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
