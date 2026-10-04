import type { Locale } from "@/i18n/dictionaries";
import { findRole, roleIcon, roleName, roleSide, roleTeams, STORYTELLER } from "@/lib/botc-roles";

export type RosterEntry = { registrationId: number; role: string | null; registration: { nickname: string } };

const chip = "inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pr-2.5 pl-1 text-xs";

/**
 * Who ran a game and who played which character (icon, nickname, character), storytellers first, then by team;
 * with `satOutLabel` also who sat it out.
 */
export function GameRoster({
  players,
  locale,
  storytellerLabel,
  satOutLabel,
}: {
  players: RosterEntry[];
  locale: Locale;
  storytellerLabel: string;
  satOutLabel?: string;
}) {
  const collator = new Intl.Collator(locale);
  const storytellers = players.filter((p) => p.role === STORYTELLER).sort((a, b) => collator.compare(a.registration.nickname, b.registration.nickname));
  const played = players
    .flatMap((p) => {
      const role = findRole(p.role);
      return role ? [{ ...p, role }] : [];
    })
    .sort(
      (a, b) =>
        roleTeams.indexOf(a.role.team) - roleTeams.indexOf(b.role.team) ||
        collator.compare(a.registration.nickname, b.registration.nickname),
    );
  const satOut = players.filter((p) => p.role === null).map((p) => p.registration.nickname).sort(collator.compare);
  if (storytellers.length === 0 && played.length === 0 && (!satOutLabel || satOut.length === 0)) return null;
  return (
    <div className="flex flex-col gap-1">
      {storytellers.length + played.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {storytellers.map(({ registrationId, registration }) => (
            <li key={registrationId} className={chip}>
              <span aria-hidden className="flex h-[22px] w-[22px] items-center justify-center text-sm">🎩</span>
              <span className="font-medium">{registration.nickname}</span>
              <span className="text-muted">· {storytellerLabel}</span>
            </li>
          ))}
          {played.map(({ registrationId, role, registration }) => (
            <li key={registrationId} className={chip}>
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/, no optimisation needed */}
              <img src={roleIcon(role.id)} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
              <span className="font-medium">{registration.nickname}</span>
              <span className={roleSide(role.team) === "evil" ? "text-accent" : "text-muted"}>· {roleName(role, locale)}</span>
            </li>
          ))}
        </ul>
      )}
      {satOutLabel && satOut.length > 0 && (
        <p className="text-xs text-muted">
          {satOutLabel}: {satOut.join(", ")}
        </p>
      )}
    </div>
  );
}
