"use client";

import { useActionState, useState, type ReactNode } from "react";
import { adminUpdateRegistrationAction, type EditPlayerResult } from "@/app/actions/admin";
import type { ArrivalMode, Registration } from "@/db/schema";
import { PencilIcon } from "../edit-pencil";
import { keepValues } from "../keep-values";
import { TimeSelect } from "../time-select";
import { Alert, Button, Field, inputClass } from "../ui";

export type EditPlayerLabels = {
  edit: string;
  nickname: string;
  email: string;
  optional: string;
  firstName: string;
  lastName: string;
  phone: string;
  arrival: string;
  departure: string;
  /** "Od začátku ({t})" */
  arrivalDefault: string;
  departureDefault: string;
  arrivesLate: string;
  storyteller: string;
  newbie: string;
  note: string;
  save: string;
  saving: string;
  close: string;
};

/** What the organiser can change in a sign-up; `email` is the shown one ("" when there is none). */
export type EditedPlayer = Pick<
  Registration,
  "id" | "nickname" | "firstName" | "lastName" | "phone" | "arrivalTime" | "departureTime" | "arrivesLate" | "canStorytell" | "isNewbie" | "note"
> & { email: string };

export type EditPlayerProps = {
  player: EditedPlayer;
  arrivalMode: ArrivalMode;
  /** session start and end as "HH:MM" in Prague time */
  start: string;
  end: string;
  /** the name, e-mail and phone were deleted after the session */
  deleted: boolean;
  emailHint?: string;
  t: EditPlayerLabels;
};

function EditPlayerForm({
  player: p,
  arrivalMode,
  start,
  end,
  deleted,
  emailHint,
  onDone,
  t,
}: EditPlayerProps & { onDone: (message?: string) => void }) {
  const [state, action, pending] = useActionState<EditPlayerResult, FormData>(async (prev, formData) => {
    const result = await adminUpdateRegistrationAction(p.id, prev, formData);
    if (result.ok) onDone(result.message);
    return result;
  }, {});
  const fe = state.fieldErrors ?? {};
  // one form per player can be open, next to the session and quick sign-up forms
  const id = (name: string) => `player${p.id}-${name}`;
  const optional = (label: string) => `${label} (${t.optional})`;
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-3 text-left whitespace-normal" data-testid="edit-player-form">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t.nickname} name={id("nickname")} errors={fe.nickname}>
          <input id={id("nickname")} name="nickname" required maxLength={100} defaultValue={p.nickname} autoComplete="off" className={inputClass} />
        </Field>
        <Field label={optional(t.email)} name={id("email")} errors={fe.email} hint={emailHint}>
          <input id={id("email")} name="email" type="email" maxLength={200} defaultValue={p.email} autoComplete="off" className={inputClass} />
        </Field>
        {!deleted && (
          <Field label={optional(t.phone)} name={id("phone")} errors={fe.phone}>
            <input id={id("phone")} name="phone" type="tel" maxLength={30} defaultValue={p.phone ?? ""} autoComplete="off" className={inputClass} />
          </Field>
        )}
      </div>
      {!deleted && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={optional(t.firstName)} name={id("firstName")} errors={fe.firstName}>
            <input id={id("firstName")} name="firstName" maxLength={100} defaultValue={p.firstName ?? ""} autoComplete="off" className={inputClass} />
          </Field>
          <Field label={optional(t.lastName)} name={id("lastName")} errors={fe.lastName}>
            <input id={id("lastName")} name="lastName" maxLength={100} defaultValue={p.lastName ?? ""} autoComplete="off" className={inputClass} />
          </Field>
        </div>
      )}
      {arrivalMode === "times" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.arrival} name={id("arrivalTime")} errors={fe.arrivalTime}>
            <TimeSelect id={id("arrivalTime")} name="arrivalTime" start={start} end={end} defaultValue={p.arrivalTime} defaultLabel={t.arrivalDefault.replace("{t}", start)} />
          </Field>
          <Field label={t.departure} name={id("departureTime")} errors={fe.departureTime}>
            <TimeSelect id={id("departureTime")} name="departureTime" start={start} end={end} defaultValue={p.departureTime} defaultLabel={t.departureDefault.replace("{t}", end)} />
          </Field>
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {arrivalMode === "late" && (
          <label className="flex items-center gap-2">
            <input id={id("arrivesLate")} name="arrivesLate" type="checkbox" defaultChecked={p.arrivesLate} className="h-4 w-4 accent-accent" />
            {t.arrivesLate}
          </label>
        )}
        <label className="flex items-center gap-2">
          <input id={id("canStorytell")} name="canStorytell" type="checkbox" defaultChecked={p.canStorytell} className="h-4 w-4 accent-accent" />
          🎩 {t.storyteller}
        </label>
        <label className="flex items-center gap-2">
          <input id={id("isNewbie")} name="isNewbie" type="checkbox" defaultChecked={p.isNewbie} className="h-4 w-4 accent-accent" />
          🌱 {t.newbie}
        </label>
      </div>
      <Field label={t.note} name={id("note")} errors={fe.note}>
        <input id={id("note")} name="note" maxLength={500} defaultValue={p.note ?? ""} autoComplete="off" className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? t.saving : t.save}</Button>
        <Button type="button" variant="secondary" onClick={() => onDone()} disabled={pending}>{t.close}</Button>
      </div>
    </form>
  );
}

function Pencil({ open, onClick, title }: { open: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-expanded={open}
      data-testid="edit-player"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border bg-card align-middle hover:border-accent hover:text-accent ${open ? "border-accent text-accent" : "border-border text-muted"}`}
    >
      <PencilIcon />
    </button>
  );
}

function useEditing() {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string>();
  return {
    editing,
    message,
    toggle: () => {
      setEditing((v) => !v);
      setMessage(undefined);
    },
    done: (m?: string) => {
      setEditing(false);
      setMessage(m);
    },
  };
}

/**
 * A row of the signed-up players' table whose pencil opens the player's form in a row below it; the table's
 * scrolling wrapper must be an `@container`. `edit` null = no pencil (a player erased at their request).
 */
export function EditablePlayerRow({
  cells,
  actions,
  columns,
  edit,
}: {
  /** the row's <td>s before the actions cell */
  cells: ReactNode;
  actions: ReactNode;
  columns: number;
  edit: EditPlayerProps | null;
}) {
  const { editing, message, toggle, done } = useEditing();
  const below = edit && (editing || message);
  return (
    <>
      <tr className={below ? "" : "border-b border-border last:border-0"}>
        {cells}
        <td className="p-3 text-right whitespace-nowrap">
          {edit && (
            <span className="mr-3">
              <Pencil open={editing} onClick={toggle} title={edit.t.edit} />
            </span>
          )}
          {actions}
        </td>
      </tr>
      {below && (
        <tr className="border-b border-border last:border-0">
          <td colSpan={columns} className="px-3 pb-3">
            {/* as wide as the visible part of a table scrolled sideways (the table's wrapper is an @container), and kept in it */}
            <div className="sticky left-3 w-[calc(100cqw-1.5rem)]">
              {editing ? <EditPlayerForm {...edit} onDone={done} /> : <Alert kind="success">{message}</Alert>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** A waitlisted player whose pencil opens their form inside the item; `edit` as in EditablePlayerRow. */
export function EditablePlayerItem({
  children,
  actions,
  edit,
}: {
  children: ReactNode;
  actions: ReactNode;
  edit: EditPlayerProps | null;
}) {
  const { editing, message, toggle, done } = useEditing();
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {children}
        <span className="flex gap-2">
          {edit && <Pencil open={editing} onClick={toggle} title={edit.t.edit} />}
          {actions}
        </span>
      </div>
      {edit && editing && <EditPlayerForm {...edit} onDone={done} />}
      {edit && !editing && message && <Alert kind="success">{message}</Alert>}
    </li>
  );
}
