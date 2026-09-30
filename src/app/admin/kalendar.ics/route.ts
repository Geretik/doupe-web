import { timingSafeEqual } from "node:crypto";
import { asc, gte } from "drizzle-orm";
import { db } from "@/db";
import { registrations, sessions, type Session } from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import { buildIcs, sessionUrl } from "@/lib/ics";
import { orgFeedKey } from "@/lib/org-feed";
import { siteName, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

function keyOk(req: Request) {
  const expected = orgFeedKey();
  const given = new URL(req.url).searchParams.get("key") ?? "";
  return Boolean(expected) && given.length === expected!.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected!));
}

/** Private iCal feed for organisers: every session with counts, storyteller and the players' e-mails. */
export async function GET(req: Request) {
  if (!keyOk(req) && !(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const since = new Date(Date.now() - 90 * 864e5);
  const list = await db.query.sessions.findMany({
    where: gte(sessions.endsAt, since),
    orderBy: [asc(sessions.startsAt)],
    with: { registrations: { orderBy: [asc(registrations.createdAt)] } },
  });
  const describe = (s: Session) => {
    const full = list.find((x) => x.id === s.id)!;
    const confirmed = full.registrations.filter((r) => r.status === "confirmed");
    const waitlisted = full.registrations.filter((r) => r.status === "waitlisted");
    const parts = [
      s.place,
      `Přihlášeno ${confirmed.length} / ${s.capacity}${waitlisted.length ? `, náhradníků ${waitlisted.length}` : ""}`,
    ];
    if (s.storyteller) parts.push(`🎩 Vypravěč: ${s.storyteller}`);
    if (confirmed.length) parts.push(confirmed.map((r) => `${r.nickname}${r.canStorytell ? " 🎩" : ""}${r.isNewbie ? " 🌱" : ""} <${r.email}>`).join("\n"));
    if (s.note) parts.push(s.note);
    parts.push(`${siteUrl()}/admin/termin/${s.id}`, sessionUrl(s.id));
    return parts.join("\n\n");
  };
  const body = buildIcs(list, `${siteName()} – organizátoři`, new Date(), describe);
  return new Response(body, {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, no-store" },
  });
}
