import type { PlaylistTrack } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import { PlaylistTable } from "./playlist-table";

/** The session's music, folded away under one line until clicked. */
export function Playlist({ tracks, t, className = "" }: { tracks: PlaylistTrack[]; t: Dict["session"]; className?: string }) {
  if (!tracks.length) return null;
  return (
    <details className={`text-sm ${className}`}>
      <summary className="cursor-pointer select-none hover:text-accent">
        <span aria-hidden className="mr-1.5">🎵</span>
        <span className="text-muted">{t.playlist(tracks.length)}</span>
      </summary>
      <div className="mt-2 flex flex-col gap-2 border-l border-border pl-3">
        <PlaylistTable tracks={tracks} labels={t.playlistColumns} />
        {/* explains CC0, so only when a song has it */}
        {tracks.some((tr) => /cc0/i.test(tr.license ?? "")) && <p className="text-xs text-muted">{t.playlistLicenseNote}</p>}
      </div>
    </details>
  );
}
