import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CalendarLinks } from "@/components/calendar-links";
import { EditPencil } from "@/components/edit-pencil";
import { PlayerList } from "@/components/player-list";
import { RegistrationForm } from "@/components/registration-form";
import { ShareButton } from "@/components/share-button";
import { ScriptLinks } from "@/components/script-links";
import { freeSpots } from "@/components/session-card";
import { Alert, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { CityBadge } from "@/components/city";
import { sessionUrl } from "@/lib/ics";
import { isAdmin } from "@/lib/admin-auth";
import { getSessionWithCount, listPublicPlayers } from "@/lib/queries";
import { formatDate, formatRange, formatTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const loadSession = cache(async (id: string) => {
  const numId = Number(id);
  if (!Number.isInteger(numId)) return null;
  return getSessionWithCount(numId);
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
  const [players, waitlist, admin, { locale, t }] = await Promise.all([
    listPublicPlayers(session.id, "confirmed"),
    listPublicPlayers(session.id, "waitlisted"),
    isAdmin(),
    getDict(),
  ]);

  const free = freeSpots(session);
  const past = session.endsAt < new Date();
  // the waitlist has priority: while anybody is queued, newcomers queue too
  const full = free === 0 || session.waitlistedCount > 0;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="text-sm text-muted hover:underline">
        {t.session.back}
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl sm:text-3xl font-bold tracking-tight">
          {session.title}
          <CityBadge city={session.city} t={t} />
          {admin && <EditPencil sessionId={session.id} title={t.session.editPencil} />}
        </h1>
        <p className="mt-2">
          <span aria-hidden className="mr-1.5">📅</span>
          {formatDate(session.startsAt, locale)}, {formatTime(session.startsAt, locale)}–{formatTime(session.endsAt, locale)}
        </p>
        <p className="text-muted">
          <span aria-hidden className="mr-1.5">📍</span>
          {session.place}
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
