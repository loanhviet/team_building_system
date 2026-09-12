"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import type { Event, EventStatus } from "@/types/api";

const TABS = [
  { href: "", label: "Tổng quan" },
  { href: "/settings", label: "Cấu hình" },
  { href: "/registrations", label: "Đăng ký" },
  { href: "/flights", label: "Chuyến bay" },
  { href: "/buses", label: "Xe" },
  { href: "/hotels", label: "Khách sạn" },
  { href: "/gala", label: "Gala" },
  { href: "/schedule", label: "Lịch & TB" },
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
    return <p className="text-sm text-zinc-500">Đang tải sự kiện...</p>;
  }

  const nextStatuses = EVENT_FORWARD_TRANSITIONS[event.status];
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div className="flex flex-col gap-5">
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
            Trạng thái: <Badge variant="outline">{EVENT_STATUS_LABELS[event.status]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {nextStatuses.map((status) => (
            <Button
              key={status}
              size="sm"
              onClick={() => transitionMutation.mutate(status)}
              disabled={transitionMutation.isPending}
            >
              Chuyển sang: {EVENT_STATUS_LABELS[status]}
            </Button>
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
              <Button
                variant="outline"
                size="sm"
                disabled={!forceStatus || transitionMutation.isPending}
                onClick={() => forceStatus && transitionMutation.mutate(forceStatus)}
              >
                Ghi đè
              </Button>
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
