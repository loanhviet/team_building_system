import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspaceHeader({
  title,
  description,
  actions,
  stats,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  stats?: { label: string; value: string | number; warn?: boolean }[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {stats && stats.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <li key={s.label} className="stat-tile">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("mt-1 font-display text-2xl tabular", s.warn && "text-[var(--ember)]")}>
                {s.value}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
