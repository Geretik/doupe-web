import type { PlaylistTrack } from "@/db/schema";

export type PlaylistLabels = {
  number: string;
  title: string;
  author: string;
  license: string;
  download: string;
  /** text of a link that has none of its own */
  link: string;
  /** "Remove “{title}”", only with onRemove */
  remove?: string;
};

function Links({ track, labels }: { track: PlaylistTrack; labels: PlaylistLabels }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      {track.links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="underline hover:text-accent">
          {l.label || labels.link}
        </a>
      ))}
    </span>
  );
}

/**
 * The songs with what each column means: a table with a header on wider screens, on a phone one
 * block per song with "Author:", "Licence:" and "Download:" in front of the values. Used on the session
 * page and as the preview in the admin (there with ✕ to remove a song).
 */
export function PlaylistTable({
  tracks,
  labels,
  onRemove,
}: {
  tracks: PlaylistTrack[];
  labels: PlaylistLabels;
  onRemove?: (index: number) => void;
}) {
  const removeLabel = (tr: PlaylistTrack) => (labels.remove ?? "").replace("{title}", tr.title);
  const removeButton = (i: number, tr: PlaylistTrack) =>
    onRemove ? (
      <button type="button" onClick={() => onRemove(i)} className="text-xs text-muted hover:text-accent" aria-label={removeLabel(tr)} title={removeLabel(tr)}>
        ✕
      </button>
    ) : null;
  return (
    <>
      <table className="hidden w-full text-left text-sm sm:table">
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th className="py-1 pr-2 text-right font-medium">{labels.number}</th>
            <th className="py-1 pr-3 font-medium">{labels.title}</th>
            <th className="py-1 pr-3 font-medium">{labels.author}</th>
            <th className="py-1 pr-3 font-medium">{labels.license}</th>
            <th className="py-1 pr-3 font-medium">{labels.download}</th>
            {onRemove && <th />}
          </tr>
        </thead>
        <tbody>
          {tracks.map((tr, i) => (
            <tr key={i} className="border-b border-border/50 align-baseline last:border-0">
              <td className="py-1 pr-2 text-right text-muted tabular-nums">{i + 1}.</td>
              <td className="py-1 pr-3 font-medium">{tr.title}</td>
              <td className="py-1 pr-3 text-muted">{tr.author}</td>
              <td className="py-1 pr-3 text-xs text-muted">{tr.license}</td>
              <td className="py-1 pr-3 text-xs"><Links track={tr} labels={labels} /></td>
              {onRemove && <td className="py-1 text-right">{removeButton(i, tr)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="flex flex-col gap-2 text-sm sm:hidden">
        {tracks.map((tr, i) => (
          <li key={i} className="grid grid-cols-[1.75rem_1fr_auto] items-baseline">
            <span className="text-muted tabular-nums">{i + 1}.</span>
            <span className="flex flex-col">
              <span className="font-medium">{tr.title}</span>
              {(tr.author || tr.license) && (
                <span className="text-xs text-muted">
                  {tr.author && <>{labels.author}: {tr.author}</>}
                  {tr.author && tr.license && " · "}
                  {tr.license && <>{labels.license}: {tr.license}</>}
                </span>
              )}
              {tr.links.length > 0 && (
                <span className="text-xs">
                  <span className="text-muted">{labels.download}: </span>
                  <Links track={tr} labels={labels} />
                </span>
              )}
            </span>
            {removeButton(i, tr)}
          </li>
        ))}
      </ol>
    </>
  );
}
