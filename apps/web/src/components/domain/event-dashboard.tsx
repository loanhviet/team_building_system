"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BedDouble, Bus, ChevronRight, PartyPopper, Plane, Users } from "lucide-react";
import Link from "next/link";
import { PageSkeleton } from "@/components/domain/page-skeleton";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Dashboard } from "@/types/api";

export function EventDashboard({ eventId }: { eventId: number }) {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["events", eventId, "dashboard"],
    queryFn: () => apiFetch<Dashboard>(`/api/events/${eventId}/dashboard`),
  });

  if (isLoading) return <PageSkeleton rows={2} />;
  if (!dashboard) return null;

  const base = `/admin/events/${eventId}`;
  const roomsMissing = Math.max(dashboard.participating_count - dashboard.rooms_assigned, 0);
  const registeredPct =
    dashboard.total_employees > 0
      ? Math.round((dashboard.registered_count / dashboard.total_employees) * 100)
      : 0;
  const roomPct =
    dashboard.rooms_total_capacity > 0
      ? Math.round((dashboard.rooms_assigned / dashboard.rooms_total_capacity) * 100)
      : 0;

  const tasks = [
    dashboard.flights_flagged_count > 0 && {
      href: `${base}/flights`,
      title: `${dashboard.flights_flagged_count} ca bay đang bị flag`,
      hint: "Mở chuyến bay để điều chỉnh",
      Icon: Plane,
    },
    dashboard.buses_flagged_count > 0 && {
      href: `${base}/buses`,
      title: `${dashboard.buses_flagged_count} ca xe đang bị flag`,
      hint: "Mở xe để điều chỉnh",
      Icon: Bus,
    },
    dashboard.buses_without_leader_count > 0 && {
      href: `${base}/buses`,
      title: `${dashboard.buses_without_leader_count} xe chưa có Trưởng xe`,
      hint: "Chỉ định trưởng xe trước khi công bố",
      Icon: Bus,
    },
    roomsMissing > 0 && {
      href: `${base}/hotels`,
      title: `${roomsMissing} người tham gia chưa có phòng`,
      hint: "Mở khách sạn để gán phòng",
      Icon: BedDouble,
    },
    dashboard.gala_unseated_count > 0 && {
      href: `${base}/gala`,
      title: `${dashboard.gala_unseated_count} người chưa có ghế Gala`,
      hint: "Team hết lượt/bị bỏ qua sẽ có lượt bù — kiểm tra sơ đồ Gala",
      Icon: PartyPopper,
    },
  ].filter(
    (t): t is { href: string; title: string; hint: string; Icon: typeof Plane } => !!t,
  );

  const shiftLine = dashboard.by_shift.map((s) => `${s.shift_name} ${s.count}`).join(" · ");
  const flaggedTotal = dashboard.flights_flagged_count + dashboard.buses_flagged_count;

  const flightCapacity = dashboard.flight_slots.reduce((sum, f) => sum + f.capacity, 0);
  const flightAssigned = dashboard.flight_slots.reduce((sum, f) => sum + f.assigned, 0);
  const busNeeded = dashboard.buses_by_leg.reduce((sum, b) => sum + b.needed, 0);
  const busAssigned = dashboard.buses_by_leg.reduce((sum, b) => sum + b.assigned, 0);

  const kpis = [
    {
      href: `${base}/registrations`,
      label: "Tiến độ hồ sơ",
      value: dashboard.registered_count,
      total: dashboard.total_employees,
      hint: `${registeredPct}% đã gửi`,
      tone: "teal" as const,
      Icon: Users,
    },
    {
      href: `${base}/flights`,
      label: "Chỗ bay đã xếp",
      value: flightAssigned,
      total: flightCapacity > 0 ? flightCapacity : null,
      hint:
        flightCapacity > 0
          ? `${Math.round((flightAssigned / flightCapacity) * 100)}% sức chứa`
          : "Chưa cấu hình chuyến bay",
      tone: "teal" as const,
      Icon: Plane,
    },
    {
      href: `${base}/buses`,
      label: "Nhu cầu xe đã xếp",
      value: busAssigned,
      total: busNeeded > 0 ? busNeeded : null,
      hint: busNeeded > 0 ? `${Math.round((busAssigned / busNeeded) * 100)}% nhu cầu` : "Chưa có nhu cầu xe",
      tone: "teal" as const,
      Icon: Bus,
    },
    {
      href: `${base}/hotels`,
      label: "Phòng đã lưu trú",
      value: dashboard.rooms_assigned,
      total: dashboard.rooms_total_capacity,
      hint: `${roomPct}% sức chứa`,
      tone: "teal" as const,
      Icon: BedDouble,
    },
    {
      href: flaggedTotal > 0 ? `${base}/flights` : `${base}/registrations`,
      label: "Cần can thiệp",
      value: flaggedTotal,
      total: null,
      hint: flaggedTotal > 0 ? "Flag bay/xe" : "Không có flag",
      tone: flaggedTotal > 0 ? ("amber" as const) : ("teal" as const),
      Icon: AlertTriangle,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="board grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Chỉ số nhanh">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="board-cell transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
              <k.Icon
                className={cn(
                  "size-4",
                  k.tone === "amber" ? "text-[var(--ember)]" : "text-primary",
                )}
                aria-hidden="true"
              />
            </div>
            <p
              className={cn(
                "board-n mt-2",
                k.tone === "amber" ? "text-[var(--ember)]" : "text-[var(--lagoon-deep)]",
              )}
            >
              {k.value}
              {k.total != null && (
                <span className="text-base font-normal text-muted-foreground">/{k.total}</span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
          </Link>
        ))}
      </section>

      <section className="surface-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Cần xử lý</h2>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              tasks.length > 0
                ? "bg-[var(--status-locking-bg)] text-[var(--status-locking-fg)]"
                : "bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]",
            )}
          >
            {tasks.length} việc
          </span>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Không có ngoại lệ. Slot bay, xe, phòng xem ở menu bên trái.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((t, i) => (
              <li key={t.title}>
                <Link
                  href={t.href}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="flex animate-in items-center gap-3 rounded-xl border border-[var(--status-flag-border)] bg-[var(--status-flag-bg)] px-4 py-3 text-[var(--status-flag-fg)] fade-in slide-in-from-bottom-1 duration-300 fill-mode-backwards hover:brightness-[0.98]"
                >
                  <t.Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t.title}</span>
                    <span className="block text-sm opacity-80">{t.hint}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold">Đăng ký</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {dashboard.not_registered_count} chưa gửi · {dashboard.participating_count} tham gia
          {shiftLine ? ` · ${shiftLine}` : ""}
        </p>
        <Link
          href={`${base}/registrations`}
          className="mt-4 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Mở danh sách đăng ký
        </Link>
      </section>
    </div>
  );
}
