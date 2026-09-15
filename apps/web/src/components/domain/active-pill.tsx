import { cn } from "@/lib/utils";

/**
 * Soft dot+label pill for a plain on/off account status (CBNV active,
 * user account locked). Deliberately not StatusChip — that one's bordered,
 * icon-led and scoped to allocation slot states; this is the calmer,
 * lower-stakes "is this record on" signal used in dense admin lists.
 */
export function ActivePill({
  active,
  activeLabel = "Hoạt động",
  inactiveLabel = "Ngừng",
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", active ? "bg-primary" : "bg-muted-foreground")} />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
