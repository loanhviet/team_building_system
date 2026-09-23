"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Bus,
  CalendarDays,
  ClipboardList,
  Database,
  Hotel,
  LayoutDashboard,
  LogOut,
  Mail,
  PartyPopper,
  MapPin,
  Plane,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { ALL_EVENT_STATUSES, EVENT_FORWARD_TRANSITIONS, EVENT_STATUS_LABELS, eventDisplayName } from "@/lib/event-status";
import { useCurrentEventId } from "@/lib/use-current-event-id";
import type { Dashboard, Event, EventStatus, PublishReadiness } from "@/types/api";

const NAV_GROUPS = [
  {
    label: "Điều hành",
    items: [
      { href: "", label: "Tổng quan", icon: LayoutDashboard },
      { href: "/registrations", label: "Đăng ký", icon: ClipboardList },
      { href: "/journey", label: "Hành trình", icon: MapPin },
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
  const contentRef = useRef<HTMLDivElement>(null);
  const base = `/admin/events/${eventId}`;

  useEffect(() => {
    setCurrentEventId(eventId);
  }, [eventId, setCurrentEventId]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
    contentRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  const { data: event, isLoading } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => apiFetch<Event>(`/api/events/${eventId}`),
  });

  const { data: dashboard } = useQuery({
    queryKey: ["events", eventId, "dashboard"],
    queryFn: () => apiFetch<Dashboard>(`/api/events/${eventId}/dashboard`),
    enabled: !!event,
  });

  const {
    data: publishReadiness,
    isFetching: readinessFetching,
    refetch: refetchReadiness,
  } = useQuery({
    queryKey: ["events", eventId, "readiness"],
    queryFn: () => apiFetch<PublishReadiness>(`/api/events/${eventId}/readiness`),
    enabled: !!event,
  });

  const transitionMutation = useMutation({
    mutationFn: (status: EventStatus) =>
      apiFetch<Event>(`/api/events/${eventId}/transition`, {
        method: "POST",
        body: JSON.stringify({
          status,
          confirm_warnings: status === "information_published",
        }),
      }),
    onSuccess: (updated) => {
      toast.success(`Đã chuyển sang: ${EVENT_STATUS_LABELS[updated.status]}`);
      queryClient.setQueryData(["events", eventId], updated);
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "readiness"] });
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
    if (status !== "information_published") return undefined;
    if (!publishReadiness || readinessFetching) {
      return "Đang kiểm tra mức độ sẵn sàng để công bố...";
    }
    return (
      <div className="flex flex-col gap-1 pt-1 text-left">
        {dashboard && (
          <p>
            Sẽ gửi email công bố hành trình cho <b>{dashboard.participating_count}</b> người tham gia.
          </p>
        )}
        {publishReadiness.blockers.length > 0 && (
          <>
            <p className="font-medium text-destructive">Lỗi bắt buộc phải xử lý:</p>
            <ul className="list-inside list-disc text-destructive">
              {publishReadiness.blockers.map((issue) => (
                <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </>
        )}
        {publishReadiness.warnings.length > 0 && (
          <>
            <p className="font-medium text-amber-700">Cảnh báo cần xác nhận:</p>
            <ul className="list-inside list-disc text-amber-700">
              {publishReadiness.warnings.map((issue) => (
                <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </>
        )}
        {publishReadiness.blockers.length === 0 && publishReadiness.warnings.length === 0 && (
          <p className="text-primary">Không có cảnh báo — dữ liệu đã đầy đủ.</p>
        )}
        {publishReadiness.blockers.length > 0 && (
          <p className="pt-1 font-medium text-destructive">
            Không thể công bố cho đến khi các lỗi bắt buộc được xử lý.
          </p>
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
  // The event workspace used to hide all company data behind the logo. Keep
  // the operational context, but make the common cross-event tasks one click
  // away for organizers as well.
  groups.push({
    label: "Dữ liệu công ty",
    items: [
      { href: `${base}/employees`, label: "Nhân sự & tài khoản", icon: Users },
      { href: `${base}/master-data`, label: "Team & địa điểm", icon: Database },
    ],
  });

  return (
    <div className="flex h-svh flex-1 overflow-hidden bg-background">
      <ShellRail
        className="hidden md:flex"
        eyebrow="BTC Event Hub"
        eventSlot={
          <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Kỳ đang thao tác</p>
            <p className="mt-1 truncate text-sm font-semibold">{eventDisplayName(event)}</p>
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
            <h1 className="truncate font-display text-lg font-semibold sm:text-xl">{eventDisplayName(event)}</h1>
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
              confirmDisabled={
                status === "information_published" &&
                (readinessFetching || !publishReadiness || publishReadiness.blockers.length > 0)
              }
              onOpen={
                status === "information_published"
                  ? () => {
                      void refetchReadiness();
                    }
                  : undefined
              }
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
                    forceStatus === "information_published"
                      ? transitionWarning(forceStatus)
                      : forceStatus
                      ? `Bỏ qua luồng chuẩn, ép từ "${EVENT_STATUS_LABELS[event.status]}" sang "${EVENT_STATUS_LABELS[forceStatus]}".`
                      : undefined
                  }
                  confirmLabel="Ghi đè"
                  destructive
                  confirmDisabled={
                    forceStatus === "information_published" &&
                    (readinessFetching || !publishReadiness || publishReadiness.blockers.length > 0)
                  }
                  onOpen={
                    forceStatus === "information_published"
                      ? () => {
                          void refetchReadiness();
                        }
                      : undefined
                  }
                  onConfirm={() => {
                    if (forceStatus) transitionMutation.mutate(forceStatus);
                  }}
                />
              </div>
            </details>
          )}
        </header>
        <div className="flex gap-1.5 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden">
          {[...NAV_GROUPS.flatMap((g) => g.items), { href: "/employees", label: "Nhân sự", icon: Users }].map((item) => {
            const href = item.href.startsWith("/admin/") ? item.href : `${base}${item.href}`;
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
        <div
          ref={contentRef}
          key={pathname}
          className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-200"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
