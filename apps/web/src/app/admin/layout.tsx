"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Database, LayoutDashboard, LogOut, Menu, Shield, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { EventStatusBadge } from "@/components/domain/status-badge";
import { RailUser, ShellRail } from "@/components/domain/shell-rail";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useCurrentEventId } from "@/lib/use-current-event-id";
import { EVENT_STATUS_LABELS } from "@/lib/event-status";
import { ROLE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Event } from "@/types/api";

function EventPicker() {
  const router = useRouter();
  const [currentEventId, setCurrentEventId] = useCurrentEventId();
  const { data: events } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch<Event[]>("/api/events"),
  });

  useEffect(() => {
    if (currentEventId == null && events && events.length > 0) {
      const rank: Record<string, number> = {
        event_started: 0,
        information_published: 1,
        allocation_processing: 2,
        registration_open: 3,
        registration_closed: 4,
        draft: 5,
        event_completed: 6,
      };
      const live = [...events].sort(
        (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.id - a.id,
      )[0];
      setCurrentEventId(live.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, currentEventId]);

  if (!events || events.length === 0) return null;
  const current = events.find((e) => e.id === currentEventId);

  return (
    <div className="mb-5 rounded-xl border border-border bg-muted/50 p-3">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Kỳ đang thao tác</p>
      <Select
        value={currentEventId ? String(currentEventId) : undefined}
        onValueChange={(v) => {
          const id = Number(v);
          const next = events.find((e) => e.id === id);
          setCurrentEventId(id);
          router.push(`/admin/events/${id}`);
          if (next) toast.message(`Đang thao tác ${next.name}`);
        }}
      >
        <SelectTrigger className="h-auto min-h-11 w-full items-start py-2 text-left">
          <SelectValue placeholder="Chọn sự kiện">
            {current ? (
              <span className="flex flex-col gap-1">
                <span className="truncate font-medium">{current.name}</span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {events.map((e) => (
            <SelectItem key={e.id} value={String(e.id)}>
              {e.name} · {EVENT_STATUS_LABELS[e.status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current && (
        <div className="mt-2">
          <EventStatusBadge status={current.status} />
        </div>
      )}
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "organizer" && user.role !== "super_admin") {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || (user.role !== "organizer" && user.role !== "super_admin")) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  const showUsers = user.role === "super_admin";
  const groups = [
    {
      label: "Điều hành",
      items: [
        { href: "/admin", label: "Tổng quan", icon: LayoutDashboard },
        { href: "/admin/events", label: "Sự kiện", icon: CalendarDays },
      ],
    },
    {
      label: "Dữ liệu",
      items: [
        { href: "/admin/employees", label: "CBNV", icon: Users },
        { href: "/admin/master-data", label: "Team & địa điểm", icon: Database },
        { href: "/admin/users", label: "Tài khoản", icon: Shield, show: showUsers },
      ],
    },
  ];

  const footer = (
    <RailUser
      name={user.full_name ?? user.email}
      meta={ROLE_LABEL[user.role] ?? user.role}
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

  const inEventWorkspace = /^\/admin\/events\/\d+/.test(pathname);

  if (inEventWorkspace) {
    return (
      <div className="flex min-h-svh flex-1 bg-background">
        <a href="#main" className="skip-link">
          Bỏ qua điều hướng
        </a>
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-1 bg-background">
      <a href="#main" className="skip-link">
        Bỏ qua điều hướng
      </a>
      <ShellRail
        className="hidden md:flex"
        eyebrow="BTC Event Hub"
        eventSlot={<EventPicker />}
        groups={groups}
        pathname={pathname}
        footer={footer}
      />
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
                <SheetTitle>Menu BTC</SheetTitle>
              </SheetHeader>
              <ShellRail
                className="h-full w-full border-0"
                eyebrow="BTC Event Hub"
                eventSlot={<EventPicker />}
                groups={groups}
                pathname={pathname}
                footer={footer}
              />
            </SheetContent>
          </Sheet>
          <p className="font-display text-base">Điều hành</p>
          <InitialsAvatar name={user.full_name ?? user.email} className="ml-auto size-8" />
        </header>
        <main id="main" className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
