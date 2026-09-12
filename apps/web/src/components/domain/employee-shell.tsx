"use client";

import {
  CalendarRange,
  MessageCircle,
  Ticket,
  Users,
  ClipboardList,
  UserRound,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BrandMark } from "@/components/domain/brand-mark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABEL } from "@/lib/format";
import { useEmployeeEvent } from "@/lib/use-employee-event";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Ticket;
  show?: boolean;
};

export function EmployeeShell({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { eventId, eventName, isLeader } = useEmployeeEvent();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.must_change_password && pathname !== "/account") {
      router.replace("/account");
    }
  }, [isLoading, user, pathname, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-svh flex-1 items-center justify-center bg-[var(--foam)]">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  const nav: NavItem[] = user.must_change_password
    ? []
    : [
        { href: "/register", label: "Đăng ký", icon: ClipboardList },
        { href: "/journey", label: "Hành trình", icon: Ticket },
        {
          href: eventId ? `/gala/${eventId}` : "/journey",
          label: "Gala",
          icon: CalendarRange,
          show: eventId != null,
        },
        { href: "/chat", label: "Hỏi đáp", icon: MessageCircle },
        { href: "/team", label: "Team", icon: Users, show: isLeader },
      ].filter((item) => item.show !== false);

  const isActive = (href: string) => {
    if (href.startsWith("/gala")) return pathname.startsWith("/gala");
    return pathname === href;
  };

  return (
    <div className="flex min-h-svh flex-col bg-[var(--foam)]">
      <header className="sticky top-0 z-30 bg-[var(--night)] text-[#e8eef2]">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <BrandMark light className="[&>span:last-child]:text-base" />
            {eventName && (
              <p className="truncate pl-9 text-[11px] text-white/55">{eventName}</p>
            )}
          </div>
          <nav className="hidden items-center gap-1 sm:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-1 text-sm",
                  isActive(item.href)
                    ? "bg-[var(--lagoon)] text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/account"
              className={cn(
                "hidden max-w-[10rem] truncate text-right text-xs sm:block",
                pathname === "/account" && "text-[var(--lagoon)]",
              )}
            >
              <span className="block truncate">{user.full_name ?? user.email}</span>
              <span className="text-white/50">{ROLE_LABEL[user.role] ?? user.role}</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-white hover:bg-white/10 sm:hidden"
              onClick={() => router.push("/account")}
              aria-label="Tài khoản"
            >
              <UserRound className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-white hover:bg-white/10"
              onClick={() => logout().then(() => router.push("/login"))}
              aria-label="Đăng xuất"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 sm:pb-8",
          nav.length > 0 ? "pb-24" : "pb-8",
        )}
      >
        {children}
      </main>

      {nav.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--night)] bg-[var(--night)] text-[#e8eef2] sm:hidden">
          <ul
            className={cn(
              "mx-auto grid max-w-3xl gap-1 px-2 py-2",
              nav.length >= 5 ? "grid-cols-5" : "grid-cols-4",
            )}
          >
            {nav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-0.5 py-1 text-[11px]",
                      active ? "text-white" : "text-white/55",
                    )}
                  >
                    <Icon className="size-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
