"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveGrimoireAction } from "@/app/actions/grimoire";
import type { GrimoireState } from "@/lib/grimoire/state";

export type SaveStatus = "saved" | "pending" | "saving" | "offline" | "conflict" | "invalid";

const SAVE_DELAY_MS = 600;
const RETRY_MS = 5000;

/** The unsaved state kept in this browser, so a reload or a lost connection loses nothing. */
type Backup = { version: number; state: GrimoireState };
const backupKey = (id: number) => `grimoar-${id}`;

function readBackup(id: number): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

function writeBackup(id: number, backup: Backup | null) {
  try {
    if (backup) localStorage.setItem(backupKey(id), JSON.stringify(backup));
    else localStorage.removeItem(backupKey(id));
  } catch {
    // private mode or full storage: saving to the server still works
  }
}

/**
 * Saves the grimoire a moment after each change, one save at a time. Without a connection it keeps
 * retrying (and keeps the state in localStorage); a save refused because the grimoire changed elsewhere
 * stops until the Storyteller picks a version.
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
        if ("ok" in result) {
          version.current = result.version;
          saved.current = toSave;
          stopped.current = false;
          setConflict(null);
          callbacks.current.onSaved(result);
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
      } catch {
        busy.current = false;
        setStatus("offline");
        timer.current = setTimeout(() => again.current(), RETRY_MS);
        return;
      }
      if (latest.current !== saved.current) again.current();
      else {
        writeBackup(id, null);
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
    writeBackup(id, { version: version.current, state });
    if (stopped.current) return;
    setStatus((s) => (s === "offline" ? s : "pending"));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [id, state, readOnly, flush]);

  // after a reload: changes this browser had not saved yet, if the server still has the version they started from
  useEffect(() => {
    if (readOnly) return;
    const backup = readBackup(id);
    if (backup && backup.version === initialVersion) callbacks.current.onRestore(backup.state);
    else if (backup) writeBackup(id, null);
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
    writeBackup(id, null);
    setConflict(null);
    setStatus("saved");
    return conflict.state;
  }, [conflict, id]);

  /** Overwrite the version saved elsewhere with this one. */
  const keepMine = useCallback(() => void flush(true), [flush]);

  return { status, conflict: conflict !== null, takeTheirs, keepMine };
}
