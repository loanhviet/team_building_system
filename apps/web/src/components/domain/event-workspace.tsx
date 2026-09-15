"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EventStatusBadge } from "@/components/domain/status-badge";
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
import { ALL_EVENT_STATUSES, EVENT_FORWARD_TRANSITIONS, EVENT_STATUS_LABELS } from "@/lib/event-status";
import { useCurrentEventId } from "@/lib/use-current-event-id";
import { cn } from "@/lib/utils";
import type { Dashboard, Event, EventStatus } from "@/types/api";

const NAV_GROUPS = [
  {
    label: "Điều hành",
    items: [
      { href: "", label: "Tổng quan" },
      { href: "/registrations", label: "Đăng ký" },
      { href: "/settings", label: "Cấu hình" },
    ],
  },
  {
    label: "Phân bổ",
    items: [
      { href: "/flights", label: "Chuyến bay" },
      { href: "/buses", label: "Xe" },
      { href: "/hotels", label: "Khách sạn" },
    ],
  },
  {
    label: "Chương trình",
    items: [
      { href: "/gala", label: "Gala" },
      { href: "/schedule", label: "Lịch & TB" },
      { href: "/knowledge", label: "Hỏi đáp" },
      { href: "/emails", label: "Email" },
    ],
  },
  {
    label: "Nhật ký",
    items: [{ href: "/audit", label: "Audit" }],
  },
];

export function EventWorkspace({ eventId, children }: { eventId: number; children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
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

  // only fetched for the confirmation copy — a stale read is fine here, the
  // backend re-validates nothing extra on transition itself
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
    return <p className="text-sm text-muted-foreground">Đang tải sự kiện...</p>;
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

  const navLink = (hrefSuffix: string, label: string) => {
    const href = `${base}${hrefSuffix}`;
    const active = hrefSuffix === "" ? pathname === base : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "nav-link text-sm",
          !active && "bg-transparent",
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-52">
        <Link href="/admin/events" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
          ← Tất cả sự kiện
        </Link>
        <nav className="hidden flex-col gap-4 lg:flex" aria-label="Mục sự kiện">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-2 text-[11px] font-medium text-muted-foreground">{group.label}</p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => navLink(item.href, item.label))}
              </div>
            </div>
          ))}
        </nav>
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
          {NAV_GROUPS.flatMap((g) => g.items).map((item) => {
            const href = `${base}${item.href}`;
            const active = item.href === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-2 text-sm",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-2xl font-semibold">{event.name}</h1>
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
        {children}
      </div>
    </div>
  );
}
