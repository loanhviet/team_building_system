"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { PageSkeleton } from "@/components/domain/page-skeleton";
import { apiFetch } from "@/lib/api";
import type { Dashboard } from "@/types/api";

/**
 * Briefing only: what BTC must do next, plus registration counts.
 * Flight/bus/room slot charts live on those pages — duplicating them here
 * is how the overview became unreadable.
 */
export function EventDashboard({ eventId }: { eventId: number }) {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["events", eventId, "dashboard"],
    queryFn: () => apiFetch<Dashboard>(`/api/events/${eventId}/dashboard`),
  });

  if (isLoading) return <PageSkeleton rows={2} />;
  if (!dashboard) return null;

  const base = `/admin/events/${eventId}`;
  const roomsMissing = Math.max(dashboard.participating_count - dashboard.rooms_assigned, 0);

  const tasks = [
    dashboard.flights_flagged_count > 0 && {
      href: `${base}/flights`,
      title: `${dashboard.flights_flagged_count} ca bay đang bị flag`,
      hint: "Mở chuyến bay để điều chỉnh",
    },
    dashboard.buses_flagged_count > 0 && {
      href: `${base}/buses`,
      title: `${dashboard.buses_flagged_count} ca xe đang bị flag`,
      hint: "Mở xe để điều chỉnh",
    },
    dashboard.buses_without_leader_count > 0 && {
      href: `${base}/buses`,
      title: `${dashboard.buses_without_leader_count} xe chưa có Trưởng xe`,
      hint: "Chỉ định trưởng xe trước khi công bố",
    },
    roomsMissing > 0 && {
      href: `${base}/hotels`,
      title: `${roomsMissing} người tham gia chưa có phòng`,
      hint: "Mở khách sạn để gán phòng",
    },
  ].filter((t): t is { href: string; title: string; hint: string } => !!t);

  const shiftLine = dashboard.by_shift.map((s) => `${s.shift_name} ${s.count}`).join(" · ");
  const flaggedTotal = dashboard.flights_flagged_count + dashboard.buses_flagged_count;

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <section
        className="board animate-in grid-cols-3 overflow-hidden rounded-2xl fade-in duration-300"
        aria-label="Chỉ số nhanh"
      >
        <Link href={`${base}/registrations`} className="board-cell transition-colors hover:bg-white/5">
          <p className="board-n">
            {dashboard.registered_count}
            <span className="text-base font-normal text-[var(--on-night)]/60">
              /{dashboard.total_employees}
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--on-night)]/70">Đã gửi đăng ký</p>
        </Link>
        <Link href={`${base}/hotels`} className="board-cell transition-colors hover:bg-white/5">
          <p className="board-n">
            {dashboard.rooms_assigned}
            <span className="text-base font-normal text-[var(--on-night)]/60">
              /{dashboard.rooms_total_capacity}
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--on-night)]/70">Phòng đã gán</p>
        </Link>
        <div className="board-cell">
          <p className="board-n">{flaggedTotal}</p>
          <p className="mt-1 text-xs text-[var(--on-night)]/70">Ca cần xử lý</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Cần xử lý</h2>
        {tasks.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
            Không có ngoại lệ. Slot bay, xe, phòng xem ở menu bên trái.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((t, i) => (
              <li key={t.title}>
                <Link
                  href={t.href}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="flex animate-in items-center gap-3 rounded-2xl border border-[var(--status-flag-border)] bg-[var(--status-flag-bg)] px-4 py-3 text-[var(--status-flag-fg)] fade-in slide-in-from-bottom-1 duration-300 fill-mode-backwards hover:brightness-[0.98]"
                >
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

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Đăng ký</h2>
        <div className="rounded-2xl border border-border bg-card px-4 py-4">
          <p className="mt-1 text-sm text-muted-foreground">
            {dashboard.not_registered_count} chưa gửi · {dashboard.participating_count} tham gia
            {shiftLine ? ` · ${shiftLine}` : ""}
          </p>
          <Link href={`${base}/registrations`} className="mt-3 inline-flex min-h-11 items-center text-sm text-primary underline">
            Mở danh sách đăng ký
          </Link>
        </div>
      </section>
    </div>
  );
}
