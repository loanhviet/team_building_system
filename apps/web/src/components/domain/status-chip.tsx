import { AlertTriangle, Ban, Check, Circle, Flag, Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusKind = "empty" | "locking" | "confirmed" | "unavailable" | "flag" | "over-slot";

const META: Record<StatusKind, { label: string; Icon: LucideIcon; className: string }> = {
  empty: {
    label: "Trống",
    Icon: Circle,
    className:
      "bg-[var(--status-empty-bg)] text-[var(--status-empty-fg)] border-[var(--status-empty-border)]",
  },
  locking: {
    label: "Đang giữ",
    Icon: Lock,
    className:
      "bg-[var(--status-locking-bg)] text-[var(--status-locking-fg)] border-[var(--status-locking-border)]",
  },
  confirmed: {
    label: "Đã xác nhận",
    Icon: Check,
    className:
      "bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)] border-[var(--status-confirmed-border)]",
  },
  unavailable: {
    label: "Không khả dụng",
    Icon: Ban,
    className:
      "bg-[var(--status-unavailable-bg)] text-[var(--status-unavailable-fg)] border-[var(--status-unavailable-border)]",
  },
  flag: {
    label: "Cờ ngoại lệ",
    Icon: Flag,
    className:
      "bg-[var(--status-flag-bg)] text-[var(--status-flag-fg)] border-[var(--status-flag-border)]",
  },
  "over-slot": {
    label: "Vượt slot",
    Icon: AlertTriangle,
    className:
      "bg-[var(--status-over-slot-bg)] text-[var(--status-over-slot-fg)] border-[var(--status-over-slot-border)]",
  },
};

export function StatusChip({
  kind,
  label,
  className,
}: {
  kind: StatusKind;
  label?: string;
  className?: string;
}) {
  const meta = META[kind];
  const Icon = meta.Icon;
  const text = label ?? meta.label;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 border px-2 py-0.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {text}
    </span>
  );
}
