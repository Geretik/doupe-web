import { locales, type Locale } from "@/i18n/dictionaries";
import { homebrewCollections } from "@/modules/botc/lib/botc-roles";
import { homebrewCollectionScript } from "@/modules/botc/lib/homebrew";

/** Built with the site: the characters change only with `npm run homebrew` and a deploy */
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

/**
 * The homebrew characters of the club's collections in this language, each in full as a script's entry, by
 * collection: the club's script tool (skript.doupeol.cz, scripts/script-tool.patch) offers them in its dialog for
 * adding a character, a collection being one of the sets to pick from. Public and open to other origins: what the
 * wiki publishes, with the club's Czech translation.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const locale = (await params).lang as Locale;
  const collections = homebrewCollections.map(({ key, name, author }) => ({
    key,
    name,
    author,
    characters: homebrewCollectionScript(key, locale)?.slice(1) ?? [],
  }));
  return Response.json({ collections }, { headers: { "access-control-allow-origin": "*" } });
}
