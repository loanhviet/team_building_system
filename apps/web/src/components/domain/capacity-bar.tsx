import { cn } from "@/lib/utils";

export function CapacityBar({
  assigned,
  capacity,
  className,
  compare = false,
}: {
  assigned: number;
  capacity: number;
  className?: string;
  /** When true, bar is a ranking vs the largest category — no "còn/vượt". */
  compare?: boolean;
}) {
  const remaining = capacity - assigned;
  const over = !compare && remaining < 0;
  const pct = capacity <= 0 ? 0 : Math.min(100, Math.round((assigned / capacity) * 100));
  const label = compare
    ? `${assigned}`
    : `${assigned}/${capacity}${over ? ", vượt sức chứa" : remaining === 0 ? ", đầy" : `, còn ${remaining}`}`;
  return (
    <div className={cn("flex min-w-[7rem] flex-col gap-1", className)}>
      <div
        className="h-2 overflow-hidden bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={assigned}
        aria-label={label}
      >
        <div
          className={cn("h-full", over ? "bg-[var(--status-over-slot-fg)]" : "bg-primary")}
          style={{ width: `${over ? 100 : pct}%` }}
        />
      </div>
      <p className={cn("tabular text-[11px]", over ? "text-[var(--status-over-slot-fg)]" : "text-muted-foreground")}>
        {compare ? assigned : `${assigned}/${capacity}${over ? " vượt" : remaining === 0 ? " đầy" : ` còn ${remaining}`}`}
      </p>
    </div>
  );
}
