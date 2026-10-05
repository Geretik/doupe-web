import Link from "next/link";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { gameStats, pastSessionStats, regulars, storytellerStats, totals } from "@/lib/stats";
import { formatDate } from "@/lib/time";

function pct(v: number | null) {
  return v === null ? "–" : `${Math.round(v * 100)} %`;
}

export default async function StatsPage() {
  await requireAdmin();
  const [{ locale, t }, sums, past, top, g, storytellers] = await Promise.all([
    getDict(),
    totals(),
    pastSessionStats(),
    regulars(),
    gameStats(),
    storytellerStats(),
  ]);
  const s = t.admin.stats;

  const tiles: [string, string | number][] = [
    [s.pastSessions, sums.pastSessions],
    [s.upcomingSessions, sums.upcomingSessions],
    [s.registrations, sums.registrations],
    [s.uniquePlayers, sums.uniquePlayers],
    [s.avgOccupancy, pct(sums.avgOccupancy)],
    [s.attendanceRate, pct(sums.attendanceRate)],
  ];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">{s.title}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <Card key={label} className="flex flex-col gap-1">
            <span className="text-xs text-muted">{label}</span>
            <span className="text-2xl font-bold">{value}</span>
          </Card>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{s.occupancyHeading}</h2>
        {past.length === 0 && <p className="text-muted">{s.noPast}</p>}
        {past.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="p-3">{s.session}</th>
                  <th className="p-3">{s.date}</th>
                  <th className="p-3 text-right">{s.registered}</th>
                  <th className="p-3 text-right">{s.occupancy}</th>
                  <th className="p-3 text-right">{s.came}</th>
                  <th className="p-3 text-right">{s.newbies}</th>
                </tr>
              </thead>
              <tbody>
                {past.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="p-3"><Link href={`/admin/termin/${row.id}`} className="hover:underline">{row.title}</Link></td>
                    <td className="p-3 whitespace-nowrap">{formatDate(row.startsAt, locale)}</td>
                    <td className="p-3 text-right">{row.confirmed} / {row.capacity}</td>
                    <td className="p-3 text-right">{pct(Math.min(1, row.confirmed / row.capacity))}</td>
                    <td className="p-3 text-right">{row.marked ? `${row.attended} / ${row.marked}` : "–"}</td>
                    <td className="p-3 text-right">{row.newbies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">🎲 {s.gamesHeading}</h2>
        <div className="grid grid-cols-3 gap-3">
          {([[s.gamesTotal, g.total], [`😇 ${s.goodWins}`, g.good], [`😈 ${s.evilWins}`, g.evil]] as [string, number][]).map(([label, value]) => (
            <Card key={label} className="flex flex-col gap-1">
              <span className="text-xs text-muted">{label}</span>
              <span className="text-2xl font-bold">{value}</span>
            </Card>
          ))}
        </div>
        {g.scripts.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="p-3">{s.script}</th>
                  <th className="p-3 text-right">{s.timesPlayed}</th>
                  <th className="p-3 text-right">{s.goodEvil}</th>
                </tr>
              </thead>
              <tbody>
                {g.scripts.map((row) => (
                  <tr key={row.name} className="border-b border-border last:border-0">
                    <td className="p-3">{row.name}</td>
                    <td className="p-3 text-right">{row.played}</td>
                    <td className="p-3 text-right">{row.good} / {row.evil}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">🎩 {s.storytellersHeading}</h2>
        <p className="text-sm text-muted">{s.storytellersHint}</p>
        {storytellers.length === 0 && <p className="text-muted">{s.storytellersNone}</p>}
        {storytellers.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="p-3">{s.nickname}</th>
                  <th className="p-3 text-right">{s.sessions}</th>
                  <th className="p-3 text-right">{s.games}</th>
                  <th className="p-3">{s.lastAt}</th>
                  <th className="p-3 text-right">{s.wonInGames}</th>
                  <th className="p-3">{s.scripts}</th>
                </tr>
              </thead>
              <tbody>
                {storytellers.map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-0">
                    <td className="p-3">{r.nickname}</td>
                    <td className="p-3 text-right">{r.nights}</td>
                    <td className="p-3 text-right">{r.games}</td>
                    <td className="p-3 whitespace-nowrap">{formatDate(r.lastAt, locale)}</td>
                    <td className="p-3 text-right">{r.good} / {r.evil}</td>
                    <td className="p-3 text-muted">{r.scripts.slice(0, 3).map((sc) => `${sc.name} ${sc.count}×`).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{s.regularsHeading}</h2>
        <p className="text-sm text-muted">{s.regularsHint}</p>
        {top.length === 0 && <p className="text-muted">{s.nobody}</p>}
        {top.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="p-3">{s.nickname}</th>
                  <th className="p-3">{s.email}</th>
                  <th className="p-3 text-right">{s.sessions}</th>
                  <th className="p-3 text-right">{s.attended}</th>
                  <th className="p-3 text-right">{s.noShow}</th>
                  <th className="p-3">{s.lastAt}</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-0">
                    <td className="p-3">{r.nickname}</td>
                    <td className="p-3">{r.email ? <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a> : <span className="text-muted">–</span>}</td>
                    <td className="p-3 text-right">{r.sessions}</td>
                    <td className="p-3 text-right">{r.attended}</td>
                    <td className="p-3 text-right">{r.noShow}</td>
                    <td className="p-3 whitespace-nowrap">{formatDate(r.lastAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
