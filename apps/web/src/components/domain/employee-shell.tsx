"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  ChevronDown,
  ClipboardList,
  LogOut,
  Menu,
  MessageCircle,
  Route,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/domain/brand-mark";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { EventStatusBadge } from "@/components/domain/status-badge";
import { isNavActive, type ShellLink } from "@/components/domain/shell-rail";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { EmployeeEventProvider, useEmployeeEvent } from "@/lib/use-employee-event";
import { cn } from "@/lib/utils";

function EmployeeEventPicker({ compact = false }: { compact?: boolean }) {
  const { events, event, setEventId } = useEmployeeEvent();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  if (events.length === 0) return null;

  return (
    <div className={cn(!compact && "rounded-xl border border-border bg-muted/50 p-3")}>
      {!compact && <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Kỳ của bạn</p>}
      <Select
        value={event ? String(event.id) : undefined}
        onValueChange={(v) => {
          const id = Number(v);
          const next = events.find((e) => e.id === id);
          setEventId(id);
          queryClient.removeQueries({ queryKey: ["journey"] });
          queryClient.removeQueries({ queryKey: ["chat"] });
          if (pathname.startsWith("/gala")) router.push(`/gala/${id}`);
          toast.message(next ? `Đang xem ${next.name}` : "Đã đổi kỳ");
        }}
      >
        <SelectTrigger className={cn("text-left", compact ? "h-9 min-h-9 w-[min(16rem,40vw)]" : "h-auto min-h-11 w-full py-2")}>
          <SelectValue placeholder="Chọn kỳ">
            {event ? <span className="truncate font-medium">{event.name}</span> : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {events.map((e) => (
            <SelectItem key={e.id} value={String(e.id)}>
              {e.name}
              {e.has_journey ? " · Hành trình" : e.can_register ? " · Đang mở ĐK" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact && event && (
        <div className="mt-2">
          <EventStatusBadge status={event.status} />
        </div>
      )}
    </div>
  );
}

export function EmployeeShell({ children }: { children: React.ReactNode }) {
  return (
    <EmployeeEventProvider>
      <EmployeeShellInner>{children}</EmployeeShellInner>
    </EmployeeEventProvider>
  );
}

function EmployeeShellInner({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { eventId, eventName, event, events, canRegister, hasJourney, isLeader, galaConfig } =
    useEmployeeEvent();
  const isChat = pathname === "/chat";
  const isGala = pathname.startsWith("/gala");

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
      <div className="flex min-h-svh flex-1 items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  const nav: ShellLink[] = user.must_change_password
    ? []
    : [
        {
          href: "/journey",
          label: "Hành trình của tôi",
          icon: Route,
        },
        {
          href: "/register",
          label: "Đăng ký thông tin",
          icon: ClipboardList,
          badge: canRegister ? "Mở" : undefined,
        },
        {
          href: eventId ? `/gala/${eventId}` : "/gala",
          label: "Gala Dinner & Ghế ngồi",
          icon: CalendarRange,
          show: !!galaConfig,
          badge: galaConfig && hasJourney ? "•" : undefined,
        },
        { href: "/chat", label: "Hỏi đáp BTC", icon: MessageCircle },
        { href: "/account", label: "Tài khoản nhân viên", icon: UserRound },
        { href: "/team", label: "Team", icon: Users, show: isLeader },
      ];

  const tabs = nav.filter((i) => i.show !== false);
  const dock = tabs
    .filter((i) => i.href !== "/team" && i.href !== "/account")
    .slice(0, 5)
    .map((i) => ({
      ...i,
      label:
        i.href === "/journey"
          ? "Hành trình"
          : i.href === "/register"
            ? "Đăng ký"
            : i.href.startsWith("/gala")
              ? "Gala"
              : i.href === "/chat"
                ? "Hỏi đáp"
                : i.label,
    }));

  const doLogout = () => logout().then(() => router.push("/login"));

  const signOut = (
    <Button
      variant="ghost"
      className="h-10 w-full justify-start text-destructive"
      onClick={doLogout}
    >
      <LogOut className="size-4" aria-hidden="true" />
      Đăng xuất
    </Button>
  );

  return (
    <div className={cn("flex flex-col bg-background", isChat ? "h-dvh overflow-hidden" : "min-h-dvh")}>
      <a href="#main" className="skip-link">
        Bỏ qua điều hướng
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-card shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Sheet>
            <SheetTrigger
              className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-10 lg:hidden")}
              aria-label="Mở menu"
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[17.5rem] p-4">
              <SheetHeader>
                <SheetTitle className="text-left">
                  <BrandMark />
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-4">
                <EmployeeEventPicker />
                <nav className="flex flex-col gap-0.5" aria-label="Điều hướng">
                  {tabs.map((item) => {
                    const Icon = item.icon;
                    const active = isNavActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className="nav-link"
                      >
                        <Icon className="size-4" aria-hidden="true" />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
                {signOut}
              </div>
            </SheetContent>
          </Sheet>

          <Link href="/journey" className="min-w-0 shrink-0">
            <BrandMark
              title={eventName ?? "Team Building"}
              subtitle={event?.destination ?? undefined}
            />
          </Link>

          <nav className="ml-4 hidden items-center gap-5 lg:flex" aria-label="Điều hướng chính">
            {tabs
              .filter((i) => i.href !== "/team")
              .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isNavActive(pathname, item.href) ? "page" : undefined}
                className="top-tab gap-1"
              >
                {item.label}
                {item.href.startsWith("/gala") ? (
                  <span className="size-2 rounded-full bg-[var(--ember)]" aria-hidden="true" />
                ) : item.badge ? (
                  <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {events.length > 1 && (
              <div className="hidden sm:block">
                <EmployeeEventPicker compact />
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-muted">
                <span className="relative">
                  <InitialsAvatar name={user.full_name ?? user.email} className="size-9" />
                  <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-card bg-emerald-500" />
                </span>
                <span className="hidden min-w-0 text-left lg:block">
                  <span className="block truncate text-xs font-semibold leading-tight">
                    {user.full_name ?? user.email}
                  </span>
                  <span className="block truncate text-[10px] font-medium text-primary">
                    {[user.employee_code, user.team_name].filter(Boolean).join(" • ") || "Tài khoản nhân viên"}
                  </span>
                </span>
                <ChevronDown className="hidden size-4 shrink-0 text-muted-foreground lg:block" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {user.full_name ?? user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => router.push("/account")}>
                    <UserRound />
                    Tài khoản nhân viên
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={doLogout}>
                  <LogOut />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main
        id="main"
        className={cn(
          "mx-auto flex w-full flex-1 flex-col",
          isChat ? "min-h-0 max-w-7xl px-4 pt-4 pb-4 sm:px-6" : "max-w-7xl px-4 pt-6 sm:px-6",
          !isChat && !isGala && dock.length > 0 ? "pb-24 md:pb-10" : "pb-8",
          isGala && "max-w-none px-0 pt-0 pb-24 md:pb-0",
        )}
      >
        <div
          key={pathname}
          className={cn("flex min-h-0 flex-1 flex-col animate-in fade-in duration-200", isChat && "min-h-0")}
        >
          {children}
        </div>
      </main>

      {!isChat && !isGala && (
        <footer className="mt-auto hidden border-t border-border bg-card md:block">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">{eventName ?? "Team Building"}</span>
              {" · "}Cổng nội bộ — thông tin hành trình của bạn.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/chat" className="hover:text-primary">
                Hỏi đáp BTC
              </Link>
              <Link href="/account" className="hover:text-primary">
                Tài khoản
              </Link>
              <button type="button" className="hover:text-destructive" onClick={doLogout}>
                Đăng xuất
              </button>
            </div>
          </div>
        </footer>
      )}

      {dock.length > 0 && (
        <nav
          aria-label="Điều hướng chính"
          className="dock fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <ul
            className={cn(
              "mx-auto grid max-w-3xl gap-1 px-2 py-1.5",
              dock.length >= 5 ? "grid-cols-5" : "grid-cols-4",
            )}
          >
            {dock.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[11px]",
                      active ? "bg-primary/12 font-medium text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
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
