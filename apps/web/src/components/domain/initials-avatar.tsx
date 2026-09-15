import { cn } from "@/lib/utils";

export function initialsFrom(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function InitialsAvatar({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary",
        className,
      )}
    >
      {initialsFrom(name)}
    </span>
  );
}
