import type { Locale } from "@/i18n/dictionaries";
import { findRole, roleIcon, roleName, roleSide, roleTeams, STORYTELLER, type BotcRole } from "@/lib/botc-roles";

export type RosterEntry = { registrationId: number; role: string | null; registration: { nickname: string } };

export type RosterLabels = {
  storyteller: string;
  sides: { good: string; evil: string; travellers: string };
  /** With it, also who sat the game out (admin) */
  satOut?: string;
};

type Played = Omit<RosterEntry, "role"> & { role: BotcRole };

const chip = "inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pr-2.5 pl-1 text-xs";

/**
 * Who ran a game and who played which character: storytellers on one line, then the players as chips
 * (icon, nickname, character) in rows for good, evil and travellers.
 */
export function GameRoster({ players, locale, t }: { players: RosterEntry[]; locale: Locale; t: RosterLabels }) {
  const collator = new Intl.Collator(locale);
  const byNickname = (a: Pick<RosterEntry, "registration">, b: Pick<RosterEntry, "registration">) =>
    collator.compare(a.registration.nickname, b.registration.nickname);
  const storytellers = players.filter((p) => p.role === STORYTELLER).sort(byNickname);
  const played = players
    .flatMap((p): Played[] => {
      const role = findRole(p.role);
      return role ? [{ ...p, role }] : [];
    })
    .sort((a, b) => roleTeams.indexOf(a.role.team) - roleTeams.indexOf(b.role.team) || byNickname(a, b));
  const satOut = players.filter((p) => p.role === null).sort(byNickname);
  const rows = [
    { key: "good", label: t.sides.good, className: "text-good", players: played.filter((p) => roleSide(p.role.team) === "good") },
    { key: "evil", label: t.sides.evil, className: "text-accent", players: played.filter((p) => roleSide(p.role.team) === "evil") },
    { key: "travellers", label: t.sides.travellers, className: "text-muted", players: played.filter((p) => roleSide(p.role.team) === null) },
  ].filter((r) => r.players.length > 0);
  if (storytellers.length === 0 && rows.length === 0 && (!t.satOut || satOut.length === 0)) return null;
  return (
    <div className="flex flex-col gap-2">
      {storytellers.length > 0 && (
        <p className="text-sm">
          <span aria-hidden className="mr-1.5">🎩</span>
          <span className="text-muted">{t.storyteller}:</span> {storytellers.map((p) => p.registration.nickname).join(", ")}
        </p>
      )}
      {rows.length > 0 && (
        <dl className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[5.5rem_1fr]">
          {rows.map((r) => (
            <div key={r.key} className="contents">
              <dt className={`text-xs font-semibold tracking-wide uppercase sm:pt-1.5 ${r.className}`}>
                {r.label} <span className="font-normal opacity-70">{r.players.length}</span>
              </dt>
              <dd className="mb-1 sm:mb-0">
                <ul className="flex flex-wrap gap-1.5">
                  {r.players.map(({ registrationId, role, registration }) => (
                    <li key={registrationId} className={chip}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/, no optimisation needed */}
                      <img src={roleIcon(role.id)} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
                      <span className="font-medium">{registration.nickname}</span>
                      <span className={roleSide(role.team) === "evil" ? "text-accent" : "text-muted"}>· {roleName(role, locale)}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {t.satOut && satOut.length > 0 && (
        <p className="text-xs text-muted">
          {t.satOut}: {satOut.map((p) => p.registration.nickname).join(", ")}
        </p>
      )}
    </div>
  );
}
