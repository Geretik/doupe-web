import Link from "next/link";
import { PrintButton } from "@/components/admin/print-button";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { attendanceUrl } from "@/lib/attendance";
import { siteName } from "@/lib/site";

export const dynamic = "force-dynamic";

const buttonClass = "rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent";

/** Printable card for the club's table with the attendance sheet's QR code; Czech with an English line for guests. */
export default async function AttendanceCardPage() {
  await requireAdmin();
  const { t } = await getDict();
  const c = t.admin.attendance.card;
  const url = attendanceUrl();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/admin/prezence" className={buttonClass}>{c.back}</Link>
        <PrintButton label={c.print} />
      </div>
      <p className="text-sm text-muted print:hidden">{c.hint}</p>

      {/* always black on white: it is meant for paper */}
      <article className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-white p-8 text-center text-black print:max-w-none print:gap-5 print:border-0 print:p-0 print:pt-[1.5cm]">
        <p className="text-sm font-semibold tracking-wide print:text-xl">{siteName()}</p>
        <h1 className="text-4xl font-bold print:text-6xl">{c.title}</h1>
        <p className="text-lg print:text-3xl">{c.when}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- plain SVG from our own route, no optimisation needed */}
        <img src="/prezence/qr.svg" alt={url} width={256} height={256} className="mt-2 h-64 w-64 print:mt-6 print:h-[10cm] print:w-[10cm]" />
        <p className="text-lg font-semibold print:text-3xl">{c.scan}</p>
        <p className="text-sm print:text-xl">{c.scanEn}</p>
        <p className="font-mono text-sm print:text-xl">{url.replace(/^https?:\/\//, "")}</p>
      </article>
    </div>
  );
}
