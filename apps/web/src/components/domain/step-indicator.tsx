import { cn } from "@/lib/utils";

export function StepIndicator({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3" aria-label="Tiến trình">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "grid size-7 place-items-center text-xs font-semibold",
                active && "bg-primary text-primary-foreground",
                done && "bg-secondary text-foreground",
                !active && !done && "border border-border text-muted-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              {i + 1}
            </span>
            <span className={cn(active ? "font-medium text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <span className="hidden text-muted-foreground sm:inline" aria-hidden>
                /
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
