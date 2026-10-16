import Link from "next/link";
import type { DeskGame } from "@/components/admin/game-finder";
import { GameLibrary } from "@/components/admin/game-library";
import { Alert, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { canAccess, requireAccess } from "@/lib/admin-auth";
import { boxesWithCode, boxOf } from "@/lib/game-boxes";
import { collectionGames, lendingSettings, listBarcodes, otherGameNames } from "@/lib/loans";
import { parseId } from "@/lib/validation";

/**
 * Admin → Půjčovna → Správa knihovny: the bar codes of the boxes, the boxes without one and the bundles of games in
 * one box, so that Půjčovna finds a game by a code; a guide to it opens under the intro. `?hra=` opens one game (links
 * from Půjčovna and Historie). One who only reads the club sees how many codes we know.
 */
export default async function GameLibraryPage({ searchParams }: { searchParams: Promise<{ hra?: string }> }) {
  const me = await requireAccess("club");
  const edit = canAccess(me, "club", "edit");
  const params = await searchParams;
  const [{ t }, codes, { noBarcode, packedIn }] = await Promise.all([getDict(), listBarcodes(), lendingSettings()]);
  const l = t.admin.loans;
  const games: DeskGame[] = collectionGames().map(({ id, name, year, url, expansion, note }) => ({ id, name, year, url, expansion, note, aka: otherGameNames(id) }));
  const inCollection = new Set(games.map((g) => g.id));
  // a game is found by a code of any game of its box; a box marked as having none is found by its name
  const withCode = boxesWithCode(codes.filter((c) => inCollection.has(c.gameId)), packedIn);
  const marked = new Set(noBarcode);
  const known = games.filter((g) => withCode.has(boxOf(g.id, packedIn))).length;
  const none = games.filter((g) => !withCode.has(boxOf(g.id, packedIn)) && marked.has(boxOf(g.id, packedIn))).length;
  const requested = parseId(params.hra);
  const initialGameId = requested && inCollection.has(requested) ? requested : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/pujcovna" className="text-sm text-accent hover:underline">
          {l.library.back}
        </Link>
        <h1 className="text-2xl font-bold">{l.library.title}</h1>
        <p className="max-w-3xl text-sm text-muted">{l.library.intro}</p>
        <p className="text-sm text-muted" data-testid="loan-codes-known">{l.codesKnown(known, games.length, none)}</p>
        {!edit && <Alert kind="info">{t.admin.readOnly}</Alert>}
        {edit && (
          <details className="max-w-3xl rounded-lg border border-border bg-card px-4 py-3 text-sm" data-testid="library-guide">
            <summary className="cursor-pointer font-medium">{l.library.guideTitle}</summary>
            <div className="mt-3 flex flex-col gap-4">
              {l.library.guide.map((part) => (
                <section key={part.title} className="flex flex-col gap-1.5">
                  <h2 className="font-semibold">{part.title}</h2>
                  <ol className="list-decimal space-y-1 pl-5 leading-relaxed">
                    {part.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </section>
              ))}
              <p className="text-muted">{l.library.guideEnd}</p>
            </div>
          </details>
        )}
      </div>

      {edit && (
        <Card>
          <GameLibrary
            // the game asked for in the address opens again when it changes
            key={initialGameId ?? "library"}
            games={games}
            codes={codes}
            noBarcode={noBarcode}
            packedIn={packedIn}
            initialGameId={initialGameId}
            t={l.desk}
          />
        </Card>
      )}
    </div>
  );
}
