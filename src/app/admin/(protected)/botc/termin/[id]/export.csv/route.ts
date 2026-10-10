import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { listRegistrationsForSession } from "@/modules/botc/lib/queries";
import { shownEmail } from "@/lib/retention";
import { formatTime } from "@/lib/time";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const numId = parseId((await params).id);
  if (!numId) return new Response("Not found", { status: 404 });
  const [{ locale, t: dict }, session, regs] = await Promise.all([
    getDict(),
    db.query.sessions.findFirst({ where: eq(sessions.id, numId) }),
    listRegistrationsForSession(numId),
  ]);
  if (!session) return new Response("Not found", { status: 404 });
  const t = dict.admin.csv;

  const yesNo = (v: boolean | null) => (v === null ? "" : v ? t.yes : t.no);
  const rows = regs.map((r) => [
    r.firstName,
    r.lastName,
    r.nickname,
    shownEmail(r.email),
    r.phone,
    t.status[r.status] ?? r.status,
    session.arrivalMode === "late" ? (r.arrivesLate ? dict.admin.session.late : dict.admin.session.fromStart) : (r.arrivalTime ?? formatTime(session.startsAt, locale)),
    session.arrivalMode === "late" ? "" : (r.departureTime ?? formatTime(session.endsAt, locale)),
    yesNo(r.canStorytell),
    yesNo(r.isNewbie),
    yesNo(r.attended),
    r.note,
    r.createdAt.toISOString(),
  ]);
  // players type nicknames and notes themselves: toCsv keeps Excel from running them as formulas
  const csv = toCsv([t.header, ...rows]);
  // header values must be ASCII: strip diacritics, keep letters/digits
  const safeTitle = session.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="botc-${session.id}-${safeTitle}.csv"`,
      "cache-control": "no-store",
    },
  });
}
