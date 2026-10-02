import type { PlaylistTrack } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";

/** The session's music, folded away under one line until clicked. */
export function Playlist({ tracks, t, className = "" }: { tracks: PlaylistTrack[]; t: Dict["session"]; className?: string }) {
  if (!tracks.length) return null;
  return (
    <details className={`text-sm ${className}`}>
      <summary className="cursor-pointer select-none hover:text-accent">
        <span aria-hidden className="mr-1.5">🎵</span>
        <span className="text-muted">{t.playlist(tracks.length)}</span>
      </summary>
      <ol className="mt-2 flex flex-col gap-1.5 border-l border-border pl-3">
        {tracks.map((tr, i) => (
          // the number in its own column, so a wrapped line starts under the song, not under the number
          <li key={i} className="grid grid-cols-[1.75rem_1fr]">
            <span className="text-muted tabular-nums">{i + 1}.</span>
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium">{tr.title}</span>
              {tr.author && <span className="text-muted">{tr.author}</span>}
              {tr.license && (
                <span className="rounded border border-border px-1 text-xs text-muted" title={t.playlistLicense}>{tr.license}</span>
              )}
              {tr.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-xs underline hover:text-accent">
                  {l.label || t.playlistDownload}
                </a>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
