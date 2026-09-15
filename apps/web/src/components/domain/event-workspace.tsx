"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Bus,
  CalendarDays,
  ClipboardList,
  Hotel,
  LayoutDashboard,
  LogOut,
  Mail,
  PartyPopper,
  Plane,
  ScrollText,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EventStatusBadge } from "@/components/domain/status-badge";
import { RailUser, ShellRail } from "@/components/domain/shell-rail";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABEL } from "@/lib/format";
import { ALL_EVENT_STATUSES, EVENT_FORWARD_TRANSITIONS, EVENT_STATUS_LABELS } from "@/lib/event-status";
import { useCurrentEventId } from "@/lib/use-current-event-id";
import type { Dashboard, Event, EventStatus } from "@/types/api";

const NAV_GROUPS = [
  {
    label: "Điều hành",
    items: [
      { href: "", label: "Tổng quan", icon: LayoutDashboard },
      { href: "/registrations", label: "Đăng ký", icon: ClipboardList },
      { href: "/settings", label: "Cấu hình", icon: Settings },
    ],
  },
  {
    label: "Phân bổ",
    items: [
      { href: "/flights", label: "Chuyến bay", icon: Plane },
      { href: "/buses", label: "Xe đưa đón", icon: Bus },
      { href: "/hotels", label: "Khách sạn", icon: Hotel },
    ],
  },
  {
    label: "Chương trình",
    items: [
      { href: "/gala", label: "Gala Dinner", icon: PartyPopper },
      { href: "/schedule", label: "Lịch & TB", icon: CalendarDays },
      { href: "/knowledge", label: "Hỏi đáp", icon: BookOpen },
      { href: "/emails", label: "Email", icon: Mail },
    ],
  },
  {
    label: "Nhật ký",
    items: [{ href: "/audit", label: "Audit", icon: ScrollText }],
  },
];

export function EventWorkspace({ eventId, children }: { eventId: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [, setCurrentEventId] = useCurrentEventId();
  const [forceStatus, setForceStatus] = useState<EventStatus | "">("");
  const base = `/admin/events/${eventId}`;

  useEffect(() => {
    setCurrentEventId(eventId);
  }, [eventId, setCurrentEventId]);

  const { data: event, isLoading } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => apiFetch<Event>(`/api/events/${eventId}`),
  });

  const { data: dashboard } = useQuery({
    queryKey: ["events", eventId, "dashboard"],
    queryFn: () => apiFetch<Dashboard>(`/api/events/${eventId}/dashboard`),
    enabled: !!event,
  });

  const transitionMutation = useMutation({
    mutationFn: (status: EventStatus) =>
      apiFetch<Event>(`/api/events/${eventId}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (updated) => {
      toast.success(`Đã chuyển sang: ${EVENT_STATUS_LABELS[updated.status]}`);
      queryClient.setQueryData(["events", eventId], updated);
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setForceStatus("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  if (isLoading || !event) {
    return <p className="p-6 text-sm text-muted-foreground">Đang tải sự kiện...</p>;
  }

  const nextStatuses = EVENT_FORWARD_TRANSITIONS[event.status];
  const isSuperAdmin = user?.role === "super_admin";

  const transitionWarning = (status: EventStatus): ReactNode => {
    if (status !== "information_published" || !dashboard) return undefined;
    const roomsMissing = dashboard.participating_count - dashboard.rooms_assigned;
    const checks = [
      { ok: dashboard.flights_flagged_count === 0, text: `${dashboard.flights_flagged_count} ca bay đang bị flag` },
      { ok: dashboard.buses_flagged_count === 0, text: `${dashboard.buses_flagged_count} ca xe đang bị flag` },
      { ok: dashboard.buses_without_leader_count === 0, text: `${dashboard.buses_without_leader_count} xe chưa có Trưởng xe` },
      { ok: roomsMissing <= 0, text: `${Math.max(roomsMissing, 0)} người tham gia chưa có phòng` },
    ];
    const problems = checks.filter((c) => !c.ok);
    return (
      <div className="flex flex-col gap-1 pt-1 text-left">
        <p>
          Sẽ gửi email công bố hành trình cho <b>{dashboard.participating_count}</b> người tham gia.
        </p>
        {problems.length > 0 ? (
          <ul className="list-inside list-disc text-destructive">
            {problems.map((p) => (
              <li key={p.text}>{p.text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-primary">Không có cảnh báo — dữ liệu đã đầy đủ.</p>
        )}
      </div>
    );
  };

  const groups = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      href: `${base}${item.href}`,
      label: item.label,
      icon: item.icon,
    })),
  }));

  return (
    <div className="flex min-h-svh flex-1 bg-background">
      <ShellRail
        className="hidden md:flex"
        eyebrow="BTC Event Hub"
        eventSlot={
          <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Kỳ đang thao tác</p>
            <p className="mt-1 truncate text-sm font-semibold">{event.name}</p>
            <div className="mt-2">
              <EventStatusBadge status={event.status} />
            </div>
            <Link href="/admin/events" className="mt-2 inline-block text-xs text-primary hover:underline">
              Tất cả sự kiện
            </Link>
          </div>
        }
        groups={groups}
        pathname={pathname}
        footer={
          user ? (
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
          ) : null
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">Quản lý sự kiện</p>
            <h1 className="truncate font-display text-lg font-semibold sm:text-xl">{event.name}</h1>
          </div>
          <EventStatusBadge status={event.status} />
          {nextStatuses.map((status) => (
            <ConfirmDialog
              key={status}
              trigger={
                <Button disabled={transitionMutation.isPending}>
                  {EVENT_STATUS_LABELS[status]}
                </Button>
              }
              title={`Chuyển sang "${EVENT_STATUS_LABELS[status]}"?`}
              description={
                transitionWarning(status) ??
                `Sự kiện sẽ chuyển từ "${EVENT_STATUS_LABELS[event.status]}" sang "${EVENT_STATUS_LABELS[status]}".`
              }
              confirmLabel="Chuyển trạng thái"
              onConfirm={() => transitionMutation.mutate(status)}
            />
          ))}
          {isSuperAdmin && (
            <details className="w-full text-sm text-muted-foreground">
              <summary className="cursor-pointer">Ghi đè trạng thái (Super Admin)</summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select value={forceStatus} onValueChange={(v) => setForceStatus(v as EventStatus)}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Chọn trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_EVENT_STATUSES.filter((s) => s !== event.status).map((s) => (
                      <SelectItem key={s} value={s}>
                        {EVENT_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" disabled={!forceStatus || transitionMutation.isPending}>
                      Ghi đè
                    </Button>
                  }
                  title="Ghi đè trạng thái sự kiện?"
                  description={
                    forceStatus
                      ? `Bỏ qua luồng chuẩn, ép từ "${EVENT_STATUS_LABELS[event.status]}" sang "${EVENT_STATUS_LABELS[forceStatus]}".`
                      : undefined
                  }
                  confirmLabel="Ghi đè"
                  destructive
                  onConfirm={() => {
                    if (forceStatus) transitionMutation.mutate(forceStatus);
                  }}
                />
              </div>
            </details>
          )}
        </header>
        <div className="flex gap-1.5 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden">
          {NAV_GROUPS.flatMap((g) => g.items).map((item) => {
            const href = `${base}${item.href}`;
            const active = item.href === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={
                  active
                    ? "shrink-0 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                    : "shrink-0 rounded-full border border-border bg-background px-3 py-2 text-sm"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <div key={pathname} className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-200">
          {children}
        </div>
      </div>
    </div>
  );
}
