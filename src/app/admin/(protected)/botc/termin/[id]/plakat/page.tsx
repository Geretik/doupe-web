import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/modules/botc/components/admin/print-button";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sessionUrl } from "@/modules/botc/lib/ics";
import { getSessionWithCount } from "@/modules/botc/lib/queries";
import { siteName } from "@/lib/site";
import { formatRange } from "@/lib/time";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";

const buttonClass = "rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent";

/** Printable A4 poster with the session's details and a QR code to its sign-up page. */
export default async function PosterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const numId = parseId((await params).id);
  if (!numId) notFound();
  const [{ locale, t }, session] = await Promise.all([getDict(), getSessionWithCount(numId)]);
  if (!session) notFound();
  const p = t.admin.poster;
  const url = sessionUrl(session.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/admin/botc/termin/${session.id}`} className={buttonClass}>{p.back}</Link>
        <PrintButton label={p.print} />
        <a href={`/botc/termin/${session.id}/qr.svg`} download={`termin-${session.id}-qr.svg`} className={buttonClass}>{p.downloadSvg}</a>
        <a href={`/botc/termin/${session.id}/qr.png`} download={`termin-${session.id}-qr.png`} className={buttonClass}>{p.downloadPng}</a>
      </div>
      <p className="text-sm text-muted print:hidden">{p.hint}</p>

      {/* always black on white: it is meant for paper */}
      <article className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-xl border border-border bg-white p-8 text-center text-black print:max-w-none print:gap-6 print:border-0 print:p-0 print:pt-[1cm]">
        <p className="text-sm font-semibold tracking-wide print:text-xl">{siteName()}</p>
        <h1 className="text-4xl font-bold print:text-6xl">{session.title}</h1>
        <p className="text-xl print:text-3xl">📅 {formatRange(session.startsAt, session.endsAt, locale)}</p>
        <p className="text-xl print:text-3xl">📍 {session.place}</p>
        <p className="text-xl print:text-3xl">🗣️ {t.session.languageLabel}: {t.session.languages[session.gameLanguage]}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- plain SVG from our own route, no optimisation needed */}
        <img src={`/botc/termin/${session.id}/qr.svg`} alt={url} width={288} height={288} className="mt-2 h-72 w-72 print:mt-8 print:h-[11cm] print:w-[11cm]" />
        <p className="text-lg font-semibold print:text-3xl">{p.scan}</p>
        <p className="font-mono text-sm print:text-xl">{url.replace(/^https?:\/\//, "")}</p>
      </article>
    </div>
  );
}
