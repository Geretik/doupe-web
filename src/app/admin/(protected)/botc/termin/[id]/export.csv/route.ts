import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";
import { listRegistrationsForSession } from "@/modules/botc/lib/queries";
import { shownEmail } from "@/lib/retention";
import { formatTime } from "@/lib/time";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";

function cell(v: string | number | boolean | null | undefined, t: Dict["admin"]["csv"]) {
  if (v === null || v === undefined) return "";
  let s = typeof v === "boolean" ? (v ? t.yes : t.no) : String(v);
  // players type nicknames and notes themselves: Excel must not run "=HYPERLINK(…)" as a formula
  // (a bare number such as the phone "+420777123456" cannot do anything and stays as it is)
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

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

  const header = t.header;
  const rows = regs.map((r) => [
    r.firstName,
    r.lastName,
    r.nickname,
    shownEmail(r.email),
    r.phone,
    t.status[r.status] ?? r.status,
    session.arrivalMode === "late" ? (r.arrivesLate ? dict.admin.session.late : dict.admin.session.fromStart) : (r.arrivalTime ?? formatTime(session.startsAt, locale)),
    session.arrivalMode === "late" ? "" : (r.departureTime ?? formatTime(session.endsAt, locale)),
    r.canStorytell,
    r.isNewbie,
    r.attended === null ? "" : r.attended,
    r.note,
    r.createdAt.toISOString(),
  ]);
  // semicolon-separated + BOM so Czech Excel opens it correctly
  const csv = "﻿" + [header, ...rows].map((row) => row.map((v) => cell(v, t)).join(";")).join("\r\n") + "\r\n";
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
