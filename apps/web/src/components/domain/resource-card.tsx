import type { ReactNode } from "react";
import { CapacityBar } from "@/components/domain/capacity-bar";
import { cn } from "@/lib/utils";

export function ResourceCard({
  title,
  subtitle,
  assigned,
  capacity,
  selected,
  onClick,
  warning,
  footer,
}: {
  title: string;
  subtitle?: string;
  assigned?: number;
  capacity?: number;
  selected?: boolean;
  onClick?: () => void;
  warning?: string;
  footer?: ReactNode;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? selected : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "min-w-[11rem] flex-1 rounded-2xl border bg-card p-3 text-left",
        onClick && "cursor-pointer",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50",
        warning && !selected && "border-[var(--status-flag-border)]",
      )}
    >
      <p className="font-display text-base font-semibold">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      {capacity != null && assigned != null && (
        <CapacityBar assigned={assigned} capacity={capacity} className="mt-2 min-w-0" />
      )}
      {warning && <p className="mt-1 text-xs text-[var(--status-flag-fg)]">{warning}</p>}
      {footer}
    </div>
  );
}
