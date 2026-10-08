import { setAttendanceAction } from "@/modules/botc/actions/sessions";

/** Three-state attendance marker: came / no-show / not marked. */
export function AttendanceToggle({
  registrationId,
  attended,
  labels,
}: {
  registrationId: number;
  attended: boolean | null;
  labels: { came: string; noShow: string };
}) {
  const btn = (value: boolean | null, label: string, title: string, active: boolean, activeCls: string) => (
    <form action={setAttendanceAction.bind(null, registrationId, value)} className="inline">
      <button
        type="submit"
        title={title}
        aria-label={title}
        aria-pressed={active}
        className={`h-7 w-7 rounded-md border text-xs ${active ? activeCls : "border-border text-muted hover:border-accent"}`}
      >
        {label}
      </button>
    </form>
  );
  return (
    <span className="inline-flex gap-1">
      {btn(attended === true ? null : true, "✓", labels.came, attended === true, "border-green-600 bg-green-600/15 text-green-700 dark:text-green-400")}
      {btn(attended === false ? null : false, "✗", labels.noShow, attended === false, "border-accent bg-accent/15 text-accent")}
    </span>
  );
}
