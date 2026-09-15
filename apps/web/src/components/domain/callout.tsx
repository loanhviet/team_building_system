import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONE: Record<
  "info" | "warn" | "ok" | "danger",
  { Icon: LucideIcon; className: string }
> = {
  info: {
    Icon: Info,
    className: "border-border bg-card text-foreground",
  },
  warn: {
    Icon: AlertTriangle,
    className:
      "border-[var(--status-flag-border)] bg-[var(--status-flag-bg)] text-[var(--status-flag-fg)]",
  },
  ok: {
    Icon: CheckCircle2,
    className: "border-primary/30 bg-primary/8 text-foreground",
  },
  danger: {
    Icon: AlertTriangle,
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "ok" | "danger";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const meta = TONE[tone];
  const Icon = meta.Icon;
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex gap-2 border px-3 py-2.5 text-sm", meta.className, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
