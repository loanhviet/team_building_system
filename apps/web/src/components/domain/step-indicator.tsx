import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function StepIndicator({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex items-start" aria-label="Tiến trình">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1.5 last:flex-none">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors duration-200",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-primary/15 text-primary",
                  !active && !done && "border border-border text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    "mx-1.5 h-px flex-1 transition-colors duration-200",
                    done ? "bg-primary/40" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
            </div>
            <span
              className={cn(
                "text-center text-xs transition-colors duration-200 sm:text-sm",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
