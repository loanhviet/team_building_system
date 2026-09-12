import { cn } from "@/lib/utils";

export function BrandMark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "grid size-7 place-items-center border border-dashed text-[11px] font-semibold tracking-tight",
          light
            ? "border-white/40 text-[#fbf6ee]"
            : "border-[var(--lagoon)] text-[var(--lagoon)]",
        )}
      >
        TB
      </span>
      <span className={cn("font-display text-lg leading-none", light ? "text-[#fbf6ee]" : "text-foreground")}>
        Team Building
      </span>
    </span>
  );
}
