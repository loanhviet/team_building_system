import { cn } from "@/lib/utils";

export function BrandMark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "grid size-8 place-items-center rounded-lg text-[11px] font-semibold tracking-tight",
          light ? "bg-white/15 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        TB
      </span>
      <span
        className={cn(
          "font-display text-[1.05rem] leading-none",
          light ? "text-white" : "text-foreground",
        )}
      >
        Team Building
      </span>
    </span>
  );
}
