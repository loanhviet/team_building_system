import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/domain/brand-mark";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { cn } from "@/lib/utils";

export type ShellLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  show?: boolean;
  badge?: string;
};

export type ShellGroup = {
  label?: string;
  items: ShellLink[];
};

export function isNavActive(pathname: string, href: string) {
  if (href === "/admin" || href === "/journey") return pathname === href;
  if (href.startsWith("/gala")) return pathname.startsWith("/gala");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ShellRail({
  eyebrow,
  eventSlot,
  groups,
  pathname,
  footer,
  onNavigate,
  className,
}: {
  eyebrow?: string;
  eventSlot?: ReactNode;
  groups: ShellGroup[];
  pathname: string;
  footer?: ReactNode;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <aside className={cn("shell-rail flex shrink-0 flex-col p-4", className)}>
      <div className="px-1 pb-5">
        <BrandMark />
        {eyebrow && <p className="mt-1.5 pl-9 text-[11px] text-muted-foreground">{eyebrow}</p>}
      </div>
      {eventSlot}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-0.5">
        {groups.map((group) => (
          <div key={group.label ?? group.items[0]?.href}>
            {group.label && (
              <p className="mb-1.5 px-2 text-[11px] font-medium tracking-wide text-muted-foreground">
                {group.label}
              </p>
            )}
            <nav className="flex flex-col gap-0.5" aria-label={group.label ?? "Điều hướng"}>
              {group.items
                .filter((item) => item.show !== false)
                .map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className="nav-link"
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
            </nav>
          </div>
        ))}
      </div>
      {footer ? <div className="mt-4 border-t border-border pt-4">{footer}</div> : null}
    </aside>
  );
}

export function RailUser({
  name,
  meta,
  href,
  action,
}: {
  name: string;
  meta?: string;
  href?: string;
  action?: ReactNode;
}) {
  const identity = (
    <div className="flex min-w-0 items-center gap-2">
      <InitialsAvatar name={name} className="size-9" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {href ? (
        <Link href={href} className="rounded-xl px-1 py-1 hover:bg-muted">
          {identity}
        </Link>
      ) : (
        <div className="px-1">{identity}</div>
      )}
      {action}
    </div>
  );
}
