import Link from "next/link";
import type { ReactNode } from "react";
import type { Dict, Locale } from "@/i18n/dictionaries";
import type { FieldChange, listAdminLog, LogEntry, LogValue, NamedRef, SessionRef } from "@/lib/admin-log";
import { findRole, roleName } from "@/modules/botc/lib/botc-roles";
import { formatShortDate, formatStamp } from "@/lib/time";

type Ctx = Omit<Awaited<ReturnType<typeof listAdminLog>>, "entries" | "olderThan"> & {
  t: Dict["admin"];
  locale: Locale;
};

const linkClass = "underline decoration-border underline-offset-2 hover:text-accent";

/** A thing the entry is about: a link while it still exists, its name as it was then either way. */
function Ref({ href, live, children }: { href: string; live: boolean; children: ReactNode }) {
  return live ? (
    <Link href={href} className={linkClass}>
      {children}
    </Link>
  ) : (
    <span>{children}</span>
  );
}

function SessionLink({ session, ctx }: { session: SessionRef; ctx: Ctx }) {
  return (
    <Ref href={`/admin/botc/termin/${session.id}`} live={ctx.exists.session.has(session.id)}>
      {session.title} ({formatShortDate(new Date(session.startsAt), ctx.locale)})
    </Ref>
  );
}

function DraftLink({ draft, ctx }: { draft: NamedRef; ctx: Ctx }) {
  return (
    <Ref href={`/admin/botc/drafty/${draft.id}`} live={ctx.exists.draft.has(draft.id)}>
      {draft.name}
    </Ref>
  );
}

function value(field: string, v: LogValue | undefined, ctx: Ctx) {
  const l = ctx.t.log;
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? l.yes : l.no;
  if (field === "startsAt" || field === "endsAt" || field === "registrationOpensAt") return formatStamp(new Date(String(v)), ctx.locale);
  if (field === "registrationState") return l.registrationStates[v as keyof typeof l.registrationStates] ?? String(v);
  if (field === "arrivalMode") return l.arrivalModes[String(v)] ?? String(v);
  if (field === "gameLanguage") return ctx.t.form.gameLanguages[v as keyof typeof ctx.t.form.gameLanguages] ?? String(v);
  return String(v);
}

/** "kapacita 12 → 14, poznámka" */
function changeList(changes: FieldChange[], labels: Record<string, string>, ctx: Ctx) {
  if (!changes.length) return ctx.t.log.none;
  return changes
    .map((c) => {
      const label = labels[c.field] ?? c.field;
      return "from" in c || "to" in c ? `${label} ${value(c.field, c.from, ctx)} → ${value(c.field, c.to, ctx)}` : label;
    })
    .join(", ");
}

/** What the entry says besides its action, as parts shown one after another. */
function details(entry: LogEntry, ctx: Ctx): ReactNode[] {
  const { t, locale } = ctx;
  const l = t.log;
  const player = (registrationId: number) => ctx.playerNicknames.get(registrationId) ?? l.unknownPlayer;
  switch (entry.action) {
    case "account.login": {
      const { method, device } = entry.data;
      return [l.loginMethods[method], device];
    }
    case "account.sessionEmails":
      return [entry.data.enabled ? l.emailsOn : l.emailsOff];
    case "account.logoutOthers":
    case "account.password":
    case "account.feedKey":
      return [];
    case "account.inviteCreate":
    case "account.inviteRevoke":
      return [t.roles[entry.data.role], entry.data.note];
    case "account.resetLink":
      return [entry.data.account.nickname];
    case "account.delete":
      return [entry.data.account.nickname, t.roles[entry.data.account.role]];
    case "web.texts": {
      const { page, locale: lang, blocks, intent } = entry.data;
      const pageTitle = (t.web.pages as Record<string, { title: string }>)[page]?.title ?? page;
      const blockLabels = t.web.blocks as Record<string, { label: string }>;
      return [pageTitle, l.locales[lang] ?? lang, l.intents[intent], blocks.map((k) => blockLabels[k]?.label ?? k).join(", ")];
    }
    case "session.create":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, entry.data.count > 1 && l.series(entry.data.count)];
    case "session.update":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, changeList(entry.data.changes, l.sessionFields, ctx)];
    case "session.delete":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />];
    case "session.registration":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, l.registrationStates[entry.data.state]];
    case "session.poll":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, entry.data.closed ? l.pollClosed : l.pollReopened];
    case "session.broadcast":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, l.quoted(entry.data.subject), l.sent(entry.data.sent, entry.data.failed)];
    case "session.reminders":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, l.sent(entry.data.sent, entry.data.failed)];
    case "session.discord":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, l.discord[entry.data.result]];
    case "session.emails":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, entry.data.enabled ? l.emailsOn : l.emailsOff];
    case "session.gameAdd":
    case "session.gameUpdate":
    case "session.gameDelete":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, l.game(entry.data.gameId)];
    case "session.playerUpdate":
      return [
        <SessionLink key="s" session={entry.data.session} ctx={ctx} />,
        player(entry.data.registrationId),
        changeList(entry.data.changes, l.playerFields, ctx),
      ];
    case "session.playerRestore":
      return [
        <SessionLink key="s" session={entry.data.session} ctx={ctx} />,
        player(entry.data.registrationId),
        entry.data.waitlisted ? l.toWaitlist : l.toConfirmed,
      ];
    case "session.attendance": {
      const { attended } = entry.data;
      return [
        <SessionLink key="s" session={entry.data.session} ctx={ctx} />,
        player(entry.data.registrationId),
        attended === null ? l.attendance.unset : attended ? l.attendance.came : l.attendance.absent,
      ];
    }
    case "session.playerErase":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, player(entry.data.registrationId), l.erased(entry.data.count)];
    case "session.playerAdd":
    case "session.playerCancel":
    case "session.playerConfirm":
    case "session.resendLink":
      return [<SessionLink key="s" session={entry.data.session} ctx={ctx} />, player(entry.data.registrationId)];
    case "draft.create":
    case "draft.update":
    case "draft.delete":
    case "draft.shuffle":
    case "draft.start":
    case "draft.cancel":
      return [<DraftLink key="d" draft={entry.data.draft} ctx={ctx} />];
    case "draft.invite":
      return [<DraftLink key="d" draft={entry.data.draft} ctx={ctx} />, entry.data.nicknames.join(", ")];
    case "draft.respond":
      return [<DraftLink key="d" draft={entry.data.draft} ctx={ctx} />, entry.data.accept ? l.accepted : l.declined];
    case "draft.member": {
      const { member, role, drafts } = entry.data;
      return [
        <DraftLink key="d" draft={entry.data.draft} ctx={ctx} />,
        member,
        role && l.memberRoles[role],
        drafts !== undefined && l.drafts(drafts),
      ];
    }
    case "draft.remove":
      return [<DraftLink key="d" draft={entry.data.draft} ctx={ctx} />, entry.data.member];
    case "draft.move":
      return [<DraftLink key="d" draft={entry.data.draft} ctx={ctx} />, entry.data.member, entry.data.delta < 0 ? l.moveUp : l.moveDown];
    case "draft.pick":
      return [
        <DraftLink key="d" draft={entry.data.draft} ctx={ctx} />,
        entry.data.roleIds
          .map((id) => {
            const role = findRole(id);
            return role ? roleName(role, locale) : id;
          })
          .join(" + "),
      ];
    case "draft.scriptCreate":
    case "draft.scriptSave":
    case "draft.scriptLibrary":
    case "draft.scriptDelete": {
      const { draft, draftScript } = entry.data;
      return [
        <DraftLink key="d" draft={draft} ctx={ctx} />,
        <Ref key="ds" href={`/admin/botc/drafty/script/${draftScript.id}`} live={ctx.exists.draftScript.has(draftScript.id)}>
          {draftScript.name}
        </Ref>,
        entry.action === "draft.scriptLibrary" && (
          <Ref key="lib" href={`/admin/botc/scripty/${entry.data.libraryId}`} live={ctx.exists.script.has(entry.data.libraryId)}>
            {entry.data.updated ? l.libraryUpdated : l.libraryNew}
          </Ref>
        ),
      ];
    }
    case "script.create":
    case "script.update":
    case "script.delete": {
      const { script } = entry.data;
      return [
        <Ref key="sc" href={`/admin/botc/scripty/${script.id}`} live={ctx.exists.script.has(script.id)}>
          {script.name}
        </Ref>,
        entry.action === "script.update" && entry.data.file && l.withFile,
      ];
    }
    case "grimoire.create":
    case "grimoire.delete":
    case "grimoire.record": {
      const { grimoire } = entry.data;
      return [
        <Ref key="g" href={`/admin/botc/grimoary/${grimoire.id}`} live={ctx.exists.grimoire.has(grimoire.id)}>
          {grimoire.name}
        </Ref>,
        entry.action === "grimoire.record" &&
          (entry.data.session ? <SessionLink key="s" session={entry.data.session} ctx={ctx} /> : l.noSession),
      ];
    }
  }
}

/** One row of admin → Historie. */
export function LogEntryRow({ entry, ctx }: { entry: LogEntry; ctx: Ctx }) {
  const l = ctx.t.log;
  // an entry of an action this version does not know (written by a newer one) shows its key
  const label = (l.actions as Record<string, string>)[entry.action] ?? entry.action;
  const parts = (l.actions as Record<string, string>)[entry.action] ? details(entry, ctx).filter((p) => p !== false && p !== null && p !== undefined && p !== "") : [];
  const who = (
    <>
      {entry.nickname}
      {entry.userId === null && <span className="ml-1 text-xs text-muted">({l.deletedAccount})</span>}
    </>
  );
  return (
    <tr className="border-b border-border align-top last:border-0" data-testid="log-entry">
      {/* on a phone who did it goes under when, so the action keeps the width */}
      <td className="p-3 whitespace-nowrap text-muted">
        {formatStamp(entry.at, ctx.locale)}
        <span className="block text-foreground sm:hidden">{who}</span>
      </td>
      <td className="hidden p-3 whitespace-nowrap sm:table-cell">{who}</td>
      <td className="p-3">
        <span className="font-medium">{label}</span>
        {parts.map((p, i) => (
          <span key={i}>
            <span className="text-muted"> · </span>
            {p}
          </span>
        ))}
      </td>
    </tr>
  );
}

export type LogCtx = Ctx;
