import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function MoreFields({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-xl border border-border bg-muted/40 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">Thêm chi tiết — không bắt buộc</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </details>
  );
}

export function ChoiceCard({
  selected,
  title,
  hint,
  onClick,
  disabled,
}: {
  selected: boolean;
  title: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-14 flex-1 rounded-2xl border px-4 py-3 text-left",
        selected ? "border-primary bg-primary/8 ring-2 ring-primary/20" : "border-border bg-card",
        disabled && "opacity-60",
      )}
    >
      <span className="block font-medium">{title}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
    </button>
  );
}
