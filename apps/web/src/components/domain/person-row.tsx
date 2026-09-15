import type { ReactNode } from "react";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { StatusChip } from "@/components/domain/status-chip";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export function PersonRow({
  name,
  code,
  team,
  selected,
  onSelect,
  flag,
  extra,
  actions,
}: {
  name: string;
  code?: string | null;
  team?: string | null;
  selected?: boolean;
  onSelect?: (next: boolean) => void;
  flag?: string | null;
  extra?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5",
        flag && "border border-[var(--status-flag-border)] bg-[var(--status-flag-bg)]",
      )}
    >
      {onSelect && (
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelect(v === true)}
          aria-label={`Chọn ${name}`}
        />
      )}
      <InitialsAvatar name={name} className="size-9" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[code, team].filter(Boolean).join(" · ") || "—"}
        </p>
        {extra}
      </div>
      {flag && <StatusChip kind="flag" label={flag} />}
      {actions}
    </div>
  );
}
