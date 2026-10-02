"use client";

import { useState, type ClipboardEvent } from "react";
import type { PlaylistTrack } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import { playlistFromPaste } from "@/lib/playlist-paste";
import { Button, inputClass } from "../ui";

/** The session's playlist: filled by pasting a table of songs, shown below as a preview; sent as JSON in a hidden field. */
export function PlaylistFields({
  initial,
  errors,
  t,
}: {
  initial: PlaylistTrack[];
  errors?: string[];
  t: Dict["admin"]["form"];
}) {
  const [tracks, setTracks] = useState(initial);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  function load(html: string, text: string) {
    const parsed = playlistFromPaste(html, text);
    if (!parsed.length) {
      setNotice({ ok: false, text: t.playlistNothing });
      return;
    }
    setTracks(parsed);
    setDraft("");
    const loaded = t.playlistLoaded.replace("{n}", String(parsed.length));
    setNotice(parsed.some((tr) => tr.links.length) ? { ok: true, text: loaded } : { ok: false, text: `${loaded} ${t.playlistNoLinks}` });
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    load(e.clipboardData.getData("text/html"), e.clipboardData.getData("text/plain"));
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="playlistPaste" className="text-sm font-medium">{t.playlist}</label>
      <p className="text-xs text-muted">{t.playlistHint}</p>
      <input type="hidden" name="playlist" value={JSON.stringify(tracks)} />
      <textarea
        id="playlistPaste"
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPaste={onPaste}
        placeholder={t.playlistPaste}
        className={inputClass}
      />
      {draft.trim() && (
        <div>
          <Button type="button" variant="secondary" onClick={() => load("", draft)}>{t.playlistLoad}</Button>
        </div>
      )}
      {notice && (
        <p className={`text-xs ${notice.ok ? "text-green-700 dark:text-green-400" : "text-accent"}`} role="status">{notice.text}</p>
      )}
      {errors?.map((e) => (
        <p key={e} className="text-sm font-medium text-accent">{e}</p>
      ))}
      {tracks.length > 0 && (
        <>
          <ol className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm" data-testid="playlist-preview">
            {tracks.map((tr, i) => (
              <li key={i} className="grid grid-cols-[1.75rem_1fr_auto] items-baseline gap-x-2">
                <span className="text-right text-muted tabular-nums">{i + 1}.</span>
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium">{tr.title}</span>
                  {tr.author && <span className="text-muted">{tr.author}</span>}
                  {tr.license && <span className="text-xs text-muted">{tr.license}</span>}
                  {tr.links.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-xs underline hover:text-accent">
                      {l.label || t.playlistLink}
                    </a>
                  ))}
                </span>
                <button
                  type="button"
                  onClick={() => setTracks((ts) => ts.filter((_, j) => j !== i))}
                  className="text-xs text-muted hover:text-accent"
                  aria-label={t.playlistRemove.replace("{title}", tr.title)}
                  title={t.playlistRemove.replace("{title}", tr.title)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
          <div>
            <Button type="button" variant="secondary" onClick={() => { setTracks([]); setNotice(null); }}>{t.playlistClear}</Button>
          </div>
        </>
      )}
    </div>
  );
}
