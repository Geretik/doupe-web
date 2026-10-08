"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveGrimoireAction } from "@/modules/botc/actions/grimoire";
import type { GrimoireState } from "@/modules/botc/lib/grimoire/state";

export type SaveStatus = "saved" | "pending" | "saving" | "offline" | "outdated" | "conflict" | "invalid";

const SAVE_DELAY_MS = 600;
const RETRY_MS = 5000;
const MAX_UNANSWERED = 20;
/** Saved grimoires kept in this browser for opening offline go after this long without being opened. */
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The grimoire as this browser last had it, so a reload, a lost connection or a page opened offline (an older
 * copy, public/grimoar-sw.js) loses nothing: the version it is based on, and whether it still waits to be saved
 * (absent in copies from before: they only ever held unsaved changes).
 */
type Backup = { version: number; state: GrimoireState; unsaved?: boolean; at?: number };
const PREFIX = "grimoar-";
const backupKey = (id: number) => `${PREFIX}${id}`;

function readBackup(id: number): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

function writeBackup(id: number, backup: Backup) {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify({ ...backup, at: Date.now() }));
  } catch {
    // private mode or full storage: saving to the server still works
  }
}

/** The same grimoire, whatever the order of the keys (the server's copy went through its schema). */
function sameState(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x).filter((k) => x[k] !== undefined);
  return keys.length === Object.keys(y).filter((k) => y[k] !== undefined).length && keys.every((k) => sameState(x[k], y[k]));
}

/** Saved grimoires not opened here for a month: nothing of them is lost, the server has them. */
function pruneBackups() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PREFIX)) continue;
      const backup = JSON.parse(localStorage.getItem(key) ?? "null") as Backup | null;
      if (backup && backup.unsaved === false && Date.now() - (backup.at ?? 0) > KEEP_MS) localStorage.removeItem(key);
    }
  } catch {
    // nothing to tidy
  }
}

/**
 * Saves the grimoire a moment after each change, one save at a time. Without a connection it keeps
 * retrying (and keeps the state in localStorage); a save refused because the grimoire changed elsewhere
 * stops until the Storyteller picks a version – unless the server's version is one this page sent and never
 * heard back about – and so does a page from before the site was updated (its save no longer exists on the
 * server: a reload, which loses nothing, fixes it).
 */
export function useAutosave({
  id,
  state,
  version: initialVersion,
  readOnly,
  onRestore,
  onSaved,
}: {
  id: number;
  state: GrimoireState;
  version: number;
  readOnly: boolean;
  /** A backup newer than the server's copy was found after a reload */
  onRestore: (state: GrimoireState) => void;
  onSaved: (result: { gameId: number | null; recorded: boolean }) => void;
}) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<{ version: number; state: GrimoireState } | null>(null);
  const version = useRef(initialVersion);
  const latest = useRef(state);
  const saved = useRef(state);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stopped = useRef(false);
  /** States sent since the last answered save whose answer never came: the server may have stored one of them */
  const unanswered = useRef<GrimoireState[]>([]);
  const callbacks = useRef({ onRestore, onSaved });
  // for the retries and the follow-up saves from inside flush
  const again = useRef<() => void>(() => {});

  useEffect(() => {
    latest.current = state;
    callbacks.current = { onRestore, onSaved };
  });

  const flush = useCallback(
    async (force = false) => {
      clearTimeout(timer.current);
      if (busy.current || (stopped.current && !force)) return;
      const toSave = latest.current;
      if (toSave === saved.current && !force) {
        setStatus("saved");
        return;
      }
      busy.current = true;
      setStatus("saving");
      try {
        const result = await saveGrimoireAction(id, version.current, toSave, force);
        busy.current = false;
        // a save of this page that reached the server though its answer was lost (weak Wi-Fi): not a change made elsewhere
        const ours = "conflict" in result ? [toSave, ...unanswered.current].find((x) => sameState(x, result.state)) : undefined;
        if ("ok" in result) {
          version.current = result.version;
          saved.current = toSave;
          unanswered.current = [];
          stopped.current = false;
          setConflict(null);
          callbacks.current.onSaved(result);
        } else if ("conflict" in result && ours) {
          version.current = result.version;
          saved.current = ours;
          unanswered.current = [];
          stopped.current = false;
        } else if ("conflict" in result) {
          stopped.current = true;
          setConflict({ version: result.version, state: result.state });
          setStatus("conflict");
          return;
        } else {
          stopped.current = true;
          setStatus("invalid");
          return;
        }
      } catch (error) {
        busy.current = false;
        if (unstable_isUnrecognizedActionError(error)) {
          stopped.current = true;
          setStatus("outdated");
          return;
        }
        if (!unanswered.current.includes(toSave)) unanswered.current = [...unanswered.current, toSave].slice(-MAX_UNANSWERED);
        setStatus("offline");
        timer.current = setTimeout(() => again.current(), RETRY_MS);
        return;
      }
      if (latest.current !== saved.current) again.current();
      else {
        writeBackup(id, { version: version.current, state: saved.current, unsaved: false });
        setStatus("saved");
      }
    },
    [id],
  );

  useEffect(() => {
    again.current = () => void flush();
  }, [flush]);

  // a change: keep it here, save it in a moment
  useEffect(() => {
    if (readOnly || state === saved.current) return;
    writeBackup(id, { version: version.current, state, unsaved: true });
    if (stopped.current) return;
    setStatus((s) => (s === "offline" ? s : "pending"));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [id, state, readOnly, flush]);

  // on opening: this browser may have more than the page – changes not saved yet, or a newer version when the page
  // is an older copy (opened offline); changes made here on an older version than the server's go to the save,
  // which asks which to keep
  useEffect(() => {
    if (readOnly) return;
    pruneBackups();
    const backup = readBackup(id);
    // a save that reached the server just before a reload, its answer lost: nothing left to save
    const unsaved = (backup?.unsaved ?? true) && !sameState(backup?.state, saved.current);
    if (backup && (backup.version > initialVersion || unsaved)) {
      version.current = backup.version;
      if (!unsaved) saved.current = backup.state;
      callbacks.current.onRestore(backup.state);
    } else writeBackup(id, { version: initialVersion, state: saved.current, unsaved: false });
  }, [id, initialVersion, readOnly]);

  useEffect(() => {
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      clearTimeout(timer.current);
    };
  }, [flush]);

  /** Take the version saved elsewhere; what was changed here is dropped. */
  const takeTheirs = useCallback(() => {
    if (!conflict) return null;
    version.current = conflict.version;
    saved.current = conflict.state;
    stopped.current = false;
    writeBackup(id, { version: conflict.version, state: conflict.state, unsaved: false });
    setConflict(null);
    setStatus("saved");
    return conflict.state;
  }, [conflict, id]);

  /** Overwrite the version saved elsewhere with this one. */
  const keepMine = useCallback(() => void flush(true), [flush]);

  return { status, conflict: conflict !== null, takeTheirs, keepMine };
}
