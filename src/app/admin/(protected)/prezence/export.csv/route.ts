import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";
import { listEntries, parseDay } from "@/lib/attendance";
import { toCsv } from "@/lib/csv";
import { formatTime } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Admin → Prezenčka: every entry of a period (?od=YYYY-MM-DD&do=YYYY-MM-DD), for the club's reports. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const q = new URL(req.url).searchParams;
  let from = parseDay(q.get("od"));
  let to = parseDay(q.get("do"));
  if (!from || !to) return new Response("Bad request", { status: 400 });
  if (from > to) [from, to] = [to, from];
  const [{ locale, t }, entries] = await Promise.all([getDict(), listEntries(from, to)]);
  const a = t.admin.attendance;
  const rows = entries.map((e) => [
    e.day,
    formatTime(e.createdAt, locale),
    e.firstName,
    e.lastName,
    t.attendance.form.answers[e.affiliation],
    e.addedBy === null ? a.csv.self : a.csv.byHand(e.addedByNickname),
  ]);
  return new Response(toCsv([a.csv.header, ...rows]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="prezence-${from}-${to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
