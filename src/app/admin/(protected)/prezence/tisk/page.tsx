import Link from "next/link";
import { PrintButton } from "@/components/admin/print-button";
import { attendanceAdminCs, attendanceAdminEn } from "@/i18n/attendance";
import { getDict } from "@/i18n/server";
import { requireAccess } from "@/lib/admin-auth";
import { attendanceUrl } from "@/lib/attendance";
import { siteName } from "@/lib/site";

export const dynamic = "force-dynamic";

const buttonClass = "select-none rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent";

/** Printable card for the club's table with the attendance sheet's QR code; every line in Czech with English under it, whatever the admin's language. */
export default async function AttendanceCardPage() {
  await requireAccess("club");
  const { t } = await getDict();
  const c = t.admin.attendance.card;
  const [cs, en] = [attendanceAdminCs.card, attendanceAdminEn.card];
  const url = attendanceUrl();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/admin/prezence" className={buttonClass}>{c.back}</Link>
        <PrintButton label={c.print} />
      </div>
      <p className="text-sm text-muted print:hidden">{c.hint}</p>

      {/* always black on white: it is meant for paper */}
      <article lang="cs" className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-white p-8 text-center text-black print:max-w-none print:gap-5 print:border-0 print:p-0 print:pt-[1.5cm]">
        <p className="text-sm font-semibold tracking-wide print:text-xl">{siteName()}</p>
        <div>
          <h1 className="text-4xl font-bold print:text-6xl">{cs.title}</h1>
          <p lang="en" className="text-2xl font-semibold text-neutral-600 print:mt-1 print:text-4xl">{en.title}</p>
        </div>
        <div>
          <p className="text-lg print:text-3xl">{cs.when}</p>
          <p lang="en" className="text-base text-neutral-600 print:text-2xl">{en.when}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- plain SVG from our own route, no optimisation needed */}
        <img src="/prezence/qr.svg" alt={url} width={256} height={256} className="mt-2 h-64 w-64 print:mt-4 print:h-[10cm] print:w-[10cm]" />
        <div>
          <p className="text-lg font-semibold print:text-3xl">{cs.scan}</p>
          <p lang="en" className="text-base text-neutral-600 print:text-2xl">{en.scan}</p>
        </div>
        <p className="font-mono text-sm print:text-xl">{url.replace(/^https?:\/\//, "")}</p>
      </article>
    </div>
  );
}
