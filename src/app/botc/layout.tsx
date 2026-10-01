import { NavLink } from "@/components/nav-link";
import { getDict } from "@/i18n/server";

const linkClass = "rounded-md px-2 py-1.5 hover:underline";

/** The Blood on the Clocktower ("Krvavka") module of the club's web: its own menu above every page. */
export default async function BotcLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getDict();
  return (
    <>
      <nav aria-label={t.nav.botc} className="mb-6 border-b border-border pb-2 text-sm print:hidden">
        {/* the links' padding hangs out of the column, so their text lines up with the page */}
        <div className="-mx-2 flex items-center gap-1 overflow-x-auto whitespace-nowrap sm:gap-3">
          <NavLink href="/botc" prefixes={["/botc/termin"]} className={linkClass}>{t.nav.sessions}</NavLink>
          <NavLink href="/botc/o-hre" className={linkClass}>{t.nav.about}</NavLink>
          <NavLink href="/botc/archiv" className={linkClass}>{t.nav.archive}</NavLink>
          <NavLink href="/botc/moje-hry" prefixes={["/botc/moje-hry"]} className={linkClass}>{t.nav.myGames}</NavLink>
        </div>
      </nav>
      {children}
    </>
  );
}
