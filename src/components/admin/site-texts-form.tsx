"use client";

import dynamic from "next/dynamic";
import { startTransition, useActionState, useEffect, useRef } from "react";
import type { SiteTextsState } from "@/app/actions/site-content";
import type { Dict } from "@/i18n/dictionaries";
import { MAX_TEXT_LENGTH, type TextKind } from "@/lib/site-content-defaults";
import { keepValues } from "../keep-values";
import { Alert, Button, inputClass } from "../ui";

// the editor only works in the browser and is big, so only the admin's text pages load it
const MarkdownEditor = dynamic(() => import("./markdown-editor"), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-md border border-border bg-card" />,
});

export type SiteTextBlock = {
  key: string;
  kind: TextKind;
  label: string;
  hint?: string;
  /** The text shown on the site now */
  value: string;
  /** Id of its newest saved version, 0 = never saved; the server refuses to save over a newer one */
  rev: number;
  /** Someone's own text (not the original from the code) */
  custom: boolean;
  /** "original text" / "changed … (who)" */
  status: string;
  /** Saved versions, newest (the current one) first */
  history: { id: number; current: boolean; label: string; preview: React.ReactNode }[];
};

/** All texts of one page in one language; saving sends only what changed (see saveSiteTextsAction). */
export function SiteTextsForm({
  action: serverAction,
  blocks,
  t,
  editorStrings,
}: {
  action: (prev: SiteTextsState, fd: FormData) => Promise<SiteTextsState>;
  blocks: SiteTextBlock[];
  t: Dict["admin"]["web"]["form"];
  editorStrings: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<SiteTextsState, FormData>(serverAction, {});
  const form = useRef<HTMLFormElement>(null);
  const fe = state.fieldErrors ?? {};

  // leaving the page with unsaved changes asks first
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const fields = form.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[data-dirty], input[type=text], textarea");
      if ([...(fields ?? [])].some((f) => f.dataset.dirty !== undefined || f.value !== f.defaultValue)) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  /** "Back to the original" and "bring this version back": the same action, told what to do instead of saving */
  const run = (intent: string, confirmText: string) => {
    if (!form.current || !confirm(confirmText)) return;
    const fd = new FormData(form.current);
    fd.set("intent", intent);
    startTransition(() => action(fd));
  };

  return (
    <form ref={form} action={action} onSubmit={keepValues(action)} className="flex flex-col gap-8">
      <p className="max-w-3xl text-sm text-muted">{t.help}</p>
      {blocks.map((b) => {
        const id = `text-${b.key.replace(".", "-")}`;
        return (
          // a new version (saved, brought back) gives the block a new key, so its editor starts from that version
          <section key={`${b.key}:${b.rev}`} aria-labelledby={`${id}-label`} className="flex max-w-3xl flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 id={`${id}-label`} className="font-semibold">
                {b.kind === "line" ? <label htmlFor={id}>{b.label}</label> : b.label}
              </h2>
              <span className="text-xs text-muted">{b.status}</span>
            </div>
            {b.hint && <p className="-mt-1 text-xs text-muted">{b.hint}</p>}
            <input type="hidden" name={`rev:${b.key}`} value={b.rev} />
            {b.kind === "line" ? (
              <input id={id} name={`body:${b.key}`} defaultValue={b.value} maxLength={MAX_TEXT_LENGTH.line} className={inputClass} />
            ) : (
              <MarkdownEditor
                name={`body:${b.key}`}
                markdown={b.value}
                labelledBy={`${id}-label`}
                strings={editorStrings}
                errorText={t.editorError}
              />
            )}
            {fe[b.key]?.map((e) => (
              <p key={e} className="text-xs text-accent">{e}</p>
            ))}
            {(b.custom || b.history.length > 0) && (
              <div className="flex flex-wrap items-start gap-3 text-sm">
                {b.custom && (
                  <Button type="button" variant="secondary" disabled={pending} onClick={() => run(`default:${b.key}`, t.backToOriginalConfirm)}>
                    {t.backToOriginal}
                  </Button>
                )}
                {b.history.length > 0 && (
                  <details className="min-w-0 flex-1 basis-60 py-2">
                    <summary className="cursor-pointer text-muted hover:text-foreground">
                      {t.history} ({b.history.length})
                    </summary>
                    <ol className="mt-2 flex flex-col gap-2">
                      {b.history.map((v) => (
                        <li key={v.id} className="rounded-md border border-border bg-card p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                            <span>
                              {v.label}
                              {v.current && <strong className="ml-2 font-medium text-foreground">{t.current}</strong>}
                            </span>
                            {!v.current && (
                              <Button type="button" variant="secondary" disabled={pending} onClick={() => run(`restore:${v.id}`, t.restoreConfirm)}>
                                {t.restore}
                              </Button>
                            )}
                          </div>
                          <div className="mt-2 max-h-60 overflow-y-auto text-sm">{v.preview}</div>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            )}
          </section>
        );
      })}
      {/* stays in view on long pages, with the result of the last save */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="submit" name="intent" value="save" disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
        {!pending && state.error && <Alert kind="error">{state.error}</Alert>}
        {!pending && state.ok && state.message && <span className="text-sm text-green-700 dark:text-green-400" role="status">{state.message}</span>}
      </div>
    </form>
  );
}
