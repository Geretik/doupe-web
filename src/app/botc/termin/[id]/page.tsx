import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CalendarLinks } from "@/modules/botc/components/calendar-links";
import { EditPencil } from "@/components/edit-pencil";
import { PlayerList } from "@/modules/botc/components/player-list";
import { Playlist } from "@/modules/botc/components/playlist";
import { RegistrationForm } from "@/modules/botc/components/registration-form";
import { ShareButton } from "@/components/share-button";
import { ScriptLinks } from "@/modules/botc/components/script-links";
import { ScriptPollSummary } from "@/modules/botc/components/script-poll-summary";
import { freeSpots } from "@/modules/botc/components/session-card";
import { Alert, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { sessionUrl } from "@/modules/botc/lib/ics";
import { isAdmin } from "@/lib/admin-auth";
import { getSessionWithCount, listPublicPlayers } from "@/modules/botc/lib/queries";
import { scriptPollOpen, scriptPollResults } from "@/modules/botc/lib/script-poll";
import { formatDate, formatRange, formatShortDate, formatTime } from "@/lib/time";
import { parseId } from "@/lib/validation";
import { effectiveRegistrationState, scheduledOpening } from "@/modules/botc/lib/registration-state";
import { RefreshAt } from "@/modules/botc/components/refresh-at";

export const dynamic = "force-dynamic";

const loadSession = cache(async (id: string) => {
  const numId = parseId(id);
  return numId ? getSessionWithCount(numId) : null;
});

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { id } = await params;
  const [session, { locale, t }, parentMeta] = await Promise.all([loadSession(id), getDict(), parent]);
  if (!session) return { title: t.notFound.title };
  const free = freeSpots(session);
  const description = `${formatRange(session.startsAt, session.endsAt, locale)} · ${session.place} · ${
    free === 0 ? t.session.full : t.session.freeSpotsLong(free, session.capacity)
  }`;
  const title = `${session.title} – ${t.meta.title}`;
  return {
    title,
    description,
    // openGraph is replaced, not merged, so carry the site-wide share image over
    openGraph: { title, description, type: "website", images: parentMeta.openGraph?.images },
  };
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await loadSession(id);
  if (!session) notFound();
  const past = session.endsAt < new Date();
  const [players, waitlist, admin, { locale, t }, poll] = await Promise.all([
    listPublicPlayers(session.id, "confirmed"),
    listPublicPlayers(session.id, "waitlisted"),
    isAdmin(),
    getDict(),
    // what is played is in the archive afterwards
    past ? null : scriptPollResults(session),
  ]);

  const free = freeSpots(session);
  const regState = effectiveRegistrationState(session);
  const opensAt = scheduledOpening(session);
  // the waitlist has priority: while anybody is queued, newcomers queue too (freeSpots says 0 then)
  const full = free === 0;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/botc" className="text-sm text-muted hover:underline">
        {t.session.back}
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl sm:text-3xl font-bold tracking-tight">
          {session.title}
          {admin && <EditPencil href={`/admin/botc/termin/${session.id}`} title={t.session.editPencil} />}
        </h1>
        <p className="mt-2">
          <span aria-hidden className="mr-1.5">📅</span>
          {formatDate(session.startsAt, locale)}, {formatTime(session.startsAt, locale)}–{formatTime(session.endsAt, locale)}
        </p>
        <p className="text-muted">
          <span aria-hidden className="mr-1.5">📍</span>
          {session.place}
        </p>
        <p className="mt-1">
          <span aria-hidden className="mr-1.5">🗣️</span>
          <span className="text-muted">{t.session.languageLabel}: </span>
          {t.session.languages[session.gameLanguage]}
        </p>
        {session.storyteller && (
          <p className="mt-1">
            <span aria-hidden className="mr-1.5">🎩</span>
            <span className="text-muted">{t.session.storytellerLabel}: </span>
            {session.storyteller}
          </p>
        )}
        {session.note && (
          <p className="mt-2 text-muted whitespace-pre-line">
            <span aria-hidden className="mr-1.5">📝</span>
            {session.note}
          </p>
        )}
        <ScriptLinks scripts={session.scripts} label={t.session.scripts(session.scripts.length)} className="mt-2" />
        {poll && <ScriptPollSummary options={poll.options} open={scriptPollOpen(session)} t={t.poll} className="mt-2" />}
        <Playlist tracks={session.playlist} t={t.session} className="mt-2" />
        {!past && <CalendarLinks session={session} t={t} className="mt-2" />}
        {!past && (
          <div className="mt-3">
            <ShareButton
              title={session.title}
              url={sessionUrl(session.id)}
              label={t.session.share}
              copiedLabel={t.session.shareCopied}
            />
          </div>
        )}
        <p className="mt-2 text-sm font-medium">
          {free === 0 ? t.session.full : t.session.freeSpotsLong(free, session.capacity)}
        </p>
      </div>
      <PlayerList heading={t.session.registered(players.length)} players={players} t={t} />
      <PlayerList heading={t.session.waitlisted(waitlist.length)} players={waitlist} t={t} muted />
      <Card>
        {past ? (
          <Alert kind="info">{t.session.past}</Alert>
        ) : regState !== "open" ? (
          <>
            <Alert kind="info">
              {opensAt
                ? t.session.registrationOpensAt(formatShortDate(opensAt, locale), formatTime(opensAt, locale))
                : regState === "paused"
                  ? t.session.registrationPaused
                  : t.session.registrationNotOpen}
            </Alert>
            {opensAt && <RefreshAt at={opensAt.toISOString()} />}
          </>
        ) : (
          <>
            {full && (
              <div className="mb-4">
                <Alert kind="info">{t.session.waitlistInfo}</Alert>
              </div>
            )}
            <h2 className="mb-4 text-lg font-semibold">
              {full ? t.session.waitlistHeading : t.session.registrationHeading}
            </h2>
            <RegistrationForm
              sessionId={session.id}
              defaultArrival={formatTime(session.startsAt, locale)}
              defaultDeparture={formatTime(session.endsAt, locale)}
              waitlist={full}
              arrivalMode={session.arrivalMode}
              phoneRequired={session.phoneRequired}
              t={t.form}
            />
          </>
        )}
      </Card>
    </div>
  );
}
