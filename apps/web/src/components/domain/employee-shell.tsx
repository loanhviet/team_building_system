"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
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
import { EventStatusBadge } from "@/components/domain/status-badge";
import { RailUser, ShellRail, isNavActive, type ShellGroup } from "@/components/domain/shell-rail";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { EVENT_STATUS_LABELS } from "@/lib/event-status";
import { ROLE_LABEL } from "@/lib/format";
import { EmployeeEventProvider, useEmployeeEvent } from "@/lib/use-employee-event";
import { cn } from "@/lib/utils";

function EmployeeEventPicker() {
  const { events, event, setEventId } = useEmployeeEvent();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  if (events.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-muted/50 p-3">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Kỳ của bạn</p>
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
        <SelectTrigger className="h-auto min-h-11 w-full py-2 text-left">
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
      {event && (
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
  const { eventId, eventName, event, canRegister, hasJourney, isLeader, galaConfig } =
    useEmployeeEvent();
  const isChat = pathname === "/chat";

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

  const nav = user.must_change_password
    ? []
    : [
        {
          href: "/journey",
          label: "Hành trình",
          icon: Route,
          badge: hasJourney ? undefined : event ? "—" : undefined,
        },
        {
          href: "/register",
          label: "Đăng ký",
          icon: ClipboardList,
          badge: canRegister ? "Mở" : undefined,
        },
        {
          href: eventId ? `/gala/${eventId}` : "/gala",
          label: "Gala",
          icon: CalendarRange,
          show: !!galaConfig,
        },
        { href: "/chat", label: "Hỏi đáp", icon: MessageCircle },
        { href: "/team", label: "Team", icon: Users, show: isLeader },
      ];

  const groups: ShellGroup[] = [
    { label: "Chuyến này", items: nav.filter((i) => i.href !== "/team") },
    { label: "Team", items: nav.filter((i) => i.href === "/team" && i.show !== false) },
    {
      label: "Tài khoản",
      items: [{ href: "/account", label: "Hồ sơ & mật khẩu", icon: UserRound }],
    },
  ].filter((g) => g.items.some((i) => i.show !== false));

  const dock = nav.filter((i) => i.show !== false).slice(0, 5);

  const footer = (
    <RailUser
      name={user.full_name ?? user.email}
      meta={ROLE_LABEL[user.role] ?? user.role}
      href="/account"
      action={
        <Button
          variant="ghost"
          className="h-10 w-full justify-start text-muted-foreground"
          onClick={() => logout().then(() => router.push("/login"))}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Đăng xuất
        </Button>
      }
    />
  );

  const rail = (
    <ShellRail
      className="h-full w-full border-0 md:h-dvh md:w-[17.5rem] md:border-r"
      eyebrow="Cổng CBNV"
      eventSlot={<EmployeeEventPicker />}
      groups={groups}
      pathname={pathname}
      footer={footer}
    />
  );

  return (
    <div className={cn("flex bg-background", isChat ? "h-dvh overflow-hidden" : "min-h-dvh")}>
      <a href="#main" className="skip-link">
        Bỏ qua điều hướng
      </a>
      <div className="hidden md:flex">{rail}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-border bg-card px-3 md:hidden">
          <Sheet>
            <SheetTrigger
              className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-11")}
              aria-label="Mở menu"
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[17.5rem] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu CBNV</SheetTitle>
              </SheetHeader>
              {rail}
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base">{eventName ?? "Team Building"}</p>
            {event && (
              <p className="truncate text-[11px] text-muted-foreground">
                {EVENT_STATUS_LABELS[event.status]}
              </p>
            )}
          </div>
        </header>
        <main
          id="main"
          className={cn(
            "mx-auto flex w-full flex-1 flex-col px-4",
            isChat ? "max-w-3xl min-h-0 pt-4 pb-4" : "max-w-3xl pt-6",
            !isChat && dock.length > 0 ? "pb-24 md:pb-8" : "pb-8",
          )}
        >
          <div key={pathname} className={cn("flex min-h-0 flex-1 flex-col animate-in fade-in duration-200", isChat && "min-h-0")}>
            {children}
          </div>
        </main>
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
    </div>
  );
}
