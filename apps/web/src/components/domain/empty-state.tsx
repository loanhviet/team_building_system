import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  variant = "empty",
  onRetry,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** "error" is for a failed request masquerading as an empty state — e.g. a
   * 500 rendering as "Chưa có dữ liệu" tells the user nothing's wrong when
   * something is. Use it whenever the empty state is reached via a query
   * `error`, not just an empty/absent result. */
  variant?: "empty" | "error";
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      {variant === "error" && <AlertCircle className="mb-1 size-8 text-destructive" />}
      <h2 className={cn("font-display text-2xl", variant === "error" && "text-destructive")}>
        {title}
      </h2>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
          Thử lại
        </Button>
      )}
      {action}
    </div>
  );
}
