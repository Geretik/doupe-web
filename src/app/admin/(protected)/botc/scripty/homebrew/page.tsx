import Link from "next/link";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAccess } from "@/lib/admin-auth";
import {
  homebrewCollections,
  homebrewRoles,
  homebrewStorytellerRoles,
  roleIcon,
  roleName,
  roleSide,
  roleTeams,
  type RoleTeam,
  type StorytellerTeam,
} from "@/modules/botc/lib/botc-roles";
import { scriptToolLinkForJson } from "@/modules/botc/lib/draft/script";
import { homebrewAbility, homebrewCollectionScript } from "@/modules/botc/lib/homebrew";

export const dynamic = "force-dynamic";

const pill = "select-none rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent";
/** Longer addresses are refused by hosts (Vercel answers 414 from about 14 kB): such a collection is a file to upload */
const LONGEST_TOOL_LINK = 12_000;

const teams: (RoleTeam | StorytellerTeam)[] = [...roleTeams, "fabled", "loric"];

/**
 * The homebrew characters the site knows (botc-roles homebrewRoles, from the BotC HomeBrew Wiki): every collection
 * with its author, its page on the wiki, its characters with their abilities, and the whole collection as a
 * script for the script tool.
 */
export default async function HomebrewPage() {
  await requireAccess("botc");
  const { locale, t } = await getDict();
  const s = t.scripts;
  const all = [...homebrewRoles, ...homebrewStorytellerRoles];
  const teamName = (team: RoleTeam | StorytellerTeam) =>
    team === "fabled" || team === "loric" ? t.grimoire.storytellerTeams[team] : t.admin.session.roleTeams[team];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/botc/scripty" className="text-sm text-muted hover:underline">{s.back}</Link>
        <h1 className="text-2xl font-bold">{s.homebrewTitle}</h1>
        <p className="max-w-3xl text-sm text-muted">{s.homebrewIntro}</p>
        <p className="text-sm text-muted">{s.homebrewCount(all.length, homebrewCollections.length)}</p>
      </div>

      <ul className="flex flex-col gap-3" data-testid="homebrew-collections">
        {homebrewCollections.map((c) => {
          const roles = all.filter((r) => r.collection === c.key);
          const toolLink = scriptToolLinkForJson(homebrewCollectionScript(c.key, locale) ?? []);
          return (
            <li key={c.key} data-collection={c.key}>
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <span className="text-sm text-muted">{[c.author && s.homebrewBy(c.author), s.characters(roles.length)].filter(Boolean).join(" · ")}</span>
                </div>
                <span className="flex flex-wrap gap-2">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className={pill}>{s.homebrewWiki} ↗</a>
                  {toolLink.length <= LONGEST_TOOL_LINK && (
                    <a href={toolLink} target="_blank" rel="noopener noreferrer" className={pill}>{s.openInTool} ↗</a>
                  )}
                  <a href={`/admin/botc/scripty/homebrew/${c.key}/script.json`} className={pill}>{s.downloadJson}</a>
                </span>
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">{s.homebrewCharacters(roles.length)}</summary>
                  <div className="mt-2 flex flex-col gap-3">
                    {teams.map((team) => {
                      const ofTeam = roles.filter((r) => r.team === team);
                      if (!ofTeam.length) return null;
                      return (
                        <section key={team} className="flex flex-col gap-1.5">
                          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{teamName(team)}</h3>
                          <ul className="grid gap-x-4 gap-y-2 md:grid-cols-2">
                            {ofTeam.map((r) => {
                              const data = homebrewAbility(r.id, locale);
                              const name = roleName(r, locale);
                              const side = team === "fabled" || team === "loric" ? null : roleSide(team);
                              return (
                                <li key={r.id} className="flex items-start gap-2">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/; lazy: the list is long and folded */}
                                  <img src={roleIcon(r.id)} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0" />
                                  <span className="flex min-w-0 flex-col">
                                    <span className={`font-semibold ${side === "good" ? "text-good" : side === "evil" ? "text-accent" : ""}`}>
                                      {name}
                                      {name !== r.en && (
                                        <span className="ml-1 text-xs font-normal text-muted" lang="en">
                                          {r.en}
                                        </span>
                                      )}
                                      {data?.setup && <span className="ml-1 text-xs font-normal text-muted">({s.homebrewSetup})</span>}
                                    </span>
                                    <span className="leading-snug">{data?.ability}</span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      );
                    })}
                  </div>
                </details>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
