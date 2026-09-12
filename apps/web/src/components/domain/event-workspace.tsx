"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EventStatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import type { Dashboard, Event, EventStatus } from "@/types/api";

const TABS = [
  { href: "", label: "Tổng quan" },
  { href: "/settings", label: "Cấu hình" },
  { href: "/registrations", label: "Đăng ký" },
  { href: "/flights", label: "Chuyến bay" },
  { href: "/buses", label: "Xe" },
  { href: "/hotels", label: "Khách sạn" },
  { href: "/gala", label: "Gala" },
  { href: "/schedule", label: "Lịch & TB" },
  { href: "/knowledge", label: "Hỏi đáp" },
  { href: "/emails", label: "Email" },
  { href: "/audit", label: "Audit" },
];

export function EventWorkspace({ eventId, children }: { eventId: number; children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [forceStatus, setForceStatus] = useState<EventStatus | "">("");
  const base = `/admin/events/${eventId}`;

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
          <p className="text-emerald-600">Không có cảnh báo — dữ liệu đã đầy đủ.</p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/events" className="text-sm text-muted-foreground hover:text-foreground">
        ← Sự kiện
      </Link>
      <div className="ticket">
        <div className="ticket-spine" />
        <div className="ticket-body">
          <p className="ticket-kicker">{event.code}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{event.name}</h1>
          {event.destination && (
            <p className="mt-1 text-sm text-muted-foreground">{event.destination}</p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Trạng thái: <EventStatusBadge status={event.status} />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {nextStatuses.map((status) => (
            <ConfirmDialog
              key={status}
              trigger={<Button size="sm" disabled={transitionMutation.isPending}>Chuyển sang: {EVENT_STATUS_LABELS[status]}</Button>}
              title={`Chuyển sang "${EVENT_STATUS_LABELS[status]}"?`}
              description={
                transitionWarning(status) ?? `Sự kiện sẽ chuyển từ "${EVENT_STATUS_LABELS[event.status]}" sang "${EVENT_STATUS_LABELS[status]}".`
              }
              confirmLabel="Chuyển trạng thái"
              onConfirm={() => transitionMutation.mutate(status)}
            />
          ))}
          {nextStatuses.length === 0 && (
            <p className="text-sm text-muted-foreground">Không còn bước tiếp theo trong luồng chuẩn.</p>
          )}
          {isSuperAdmin && (
            <div className="ml-auto flex items-center gap-2">
              <Select value={forceStatus} onValueChange={(v) => setForceStatus(v as EventStatus)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Ghi đè trạng thái (Super Admin)" />
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
                  <Button variant="outline" size="sm" disabled={!forceStatus || transitionMutation.isPending}>
                    Ghi đè
                  </Button>
                }
                title="Ghi đè trạng thái sự kiện?"
                description={
                  forceStatus
                    ? `Bỏ qua luồng chuẩn, ép trạng thái từ "${EVENT_STATUS_LABELS[event.status]}" sang "${EVENT_STATUS_LABELS[forceStatus]}". Chỉ Super Admin mới làm được — dùng khi có sự cố cần sửa tay.`
                    : undefined
                }
                confirmLabel="Ghi đè"
                destructive
                onConfirm={() => {
                  if (forceStatus) transitionMutation.mutate(forceStatus);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="-mx-1 flex gap-0 overflow-x-auto border-b border-[var(--rule)]">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
          const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2 text-sm",
                active
                  ? "border-[var(--lagoon)] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
