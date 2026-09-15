import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  light = false,
  title = "Team Building",
  subtitle,
}: {
  className?: string;
  light?: boolean;
  title?: string;
  subtitle?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg text-[11px] font-bold tracking-tight",
          light ? "bg-white/15 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        TB
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate font-display text-[1.05rem] leading-tight font-bold",
            light ? "text-white" : "text-primary",
          )}
        >
          {title}
        </span>
        {subtitle ? (
          <span
            className={cn(
              "block truncate text-[10px] font-medium leading-tight",
              light ? "text-white/70" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
