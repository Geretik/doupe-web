import type { ReactNode } from "react";

export function Field({
  label,
  name,
  errors,
  hint,
  children,
}: {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !errors?.length && (
        <p className="text-xs text-muted">{hint}</p>
      )}
      {errors?.map((e) => (
        <p key={e} className="text-xs text-accent">
          {e}
        </p>
      ))}
    </div>
  );
}

export const inputClass =
  "rounded-md border border-border bg-card px-3 py-2 text-base outline-none focus:ring-2 focus:ring-accent/40";

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-accent text-accent-foreground hover:opacity-90",
    secondary: "border border-border bg-card hover:bg-border/40",
    danger: "border border-accent text-accent hover:bg-accent/10",
  }[variant];
  return (
    <button className={`${base} ${styles}`} {...props}>
      {children}
    </button>
  );
}

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`rounded-xl border border-border bg-card p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Alert({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: ReactNode;
}) {
  const cls = {
    error: "border-accent/50 bg-accent/10 text-accent",
    success: "border-green-600/40 bg-green-600/10 text-green-800 dark:text-green-300",
    info: "border-border bg-card text-muted",
  }[kind];
  return <div className={`rounded-md border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Checkbox({
  name,
  label,
  hint,
  defaultChecked = false,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label htmlFor={name} className="flex items-start gap-3 text-sm">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-accent"
      />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
