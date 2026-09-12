"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { Dashboard } from "@/types/api";

function BoardCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="board-cell">
      <p className="board-n">{value}</p>
      <p className="mt-1 text-xs text-white/55">{label}</p>
    </div>
  );
}

/**
 * The event stats board, shared by /admin (global, most-recent event) and
 * /admin/events/[id] (this specific event) — before this existed the two
 * pages had verbatim-duplicated JSX to keep in sync by hand.
 */
export function EventDashboard({ eventId }: { eventId: number }) {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["events", eventId, "dashboard"],
    queryFn: () => apiFetch<Dashboard>(`/api/events/${eventId}/dashboard`),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải số liệu...</p>;
  }
  if (!dashboard) return null;

  const base = `/admin/events/${eventId}`;
  const roomsNeeded = dashboard.participating_count;

  const warnings = [
    dashboard.flights_flagged_count > 0 && {
      href: `${base}/flights`,
      text: `${dashboard.flights_flagged_count} ca bay bị flag — cần xử lý`,
    },
    dashboard.buses_flagged_count > 0 && {
      href: `${base}/buses`,
      text: `${dashboard.buses_flagged_count} ca xe bị flag — cần xử lý`,
    },
    dashboard.buses_without_leader_count > 0 && {
      href: `${base}/buses`,
      text: `${dashboard.buses_without_leader_count} xe chưa có Trưởng xe`,
    },
    roomsNeeded > dashboard.rooms_assigned && {
      href: `${base}/hotels`,
      text: `${roomsNeeded - dashboard.rooms_assigned} người tham gia chưa có phòng`,
    },
  ].filter((w): w is { href: string; text: string } => !!w);

  return (
    <div className="flex flex-col gap-4">
      <div className="board grid-cols-2 sm:grid-cols-4">
        <BoardCell label="Tổng CBNV" value={dashboard.total_employees} />
        <BoardCell label="Đã đăng ký" value={dashboard.registered_count} />
        <BoardCell label="Chưa đăng ký" value={dashboard.not_registered_count} />
        <BoardCell label="Tham gia" value={dashboard.participating_count} />
      </div>

      {warnings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {warnings.map((w) => (
            <Link key={w.href + w.text} href={w.href}>
              <Badge variant="destructive">{w.text}</Badge>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Theo ca</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {dashboard.by_shift.map((s) => (
              <Badge key={s.shift_name} variant="outline">
                {s.shift_name}: {s.count}
              </Badge>
            ))}
            {dashboard.by_shift.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nhu cầu xe theo chặng</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {dashboard.transport_need_by_leg.map((l) => (
              <Badge key={l.leg_name} variant="outline">
                {l.leg_name}: {l.count}
              </Badge>
            ))}
            {dashboard.transport_need_by_leg.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu</p>
            )}
          </CardContent>
        </Card>

        <Link href={`${base}/flights`} className="block">
          <Card className="h-full hover:border-[var(--lagoon)]">
            <CardHeader>
              <CardTitle className="text-base">Tình trạng slot chuyến bay</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {dashboard.flight_slots.map((f) => (
                <Badge key={f.flight_code} variant={f.assigned >= f.capacity ? "secondary" : "outline"}>
                  {f.flight_code} ({f.direction}): {f.assigned}/{f.capacity}
                </Badge>
              ))}
              {dashboard.flight_slots.length === 0 && (
                <p className="text-sm text-muted-foreground">Chưa có chuyến bay</p>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href={`${base}/buses`} className="block">
          <Card className="h-full hover:border-[var(--lagoon)]">
            <CardHeader>
              <CardTitle className="text-base">Phân xe theo chặng</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {dashboard.buses_by_leg.map((l) => (
                <Badge key={l.leg_name} variant={l.assigned >= l.needed ? "outline" : "secondary"}>
                  {l.leg_name}: {l.assigned}/{l.needed}
                </Badge>
              ))}
              {dashboard.buses_by_leg.length === 0 && (
                <p className="text-sm text-muted-foreground">Chưa cấu hình chặng xe</p>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href={`${base}/hotels`} className="block">
          <Card className="h-full hover:border-[var(--lagoon)]">
            <CardHeader>
              <CardTitle className="text-base">Phòng</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant={dashboard.rooms_assigned >= roomsNeeded ? "outline" : "secondary"}>
                Đã có phòng: {dashboard.rooms_assigned}/{roomsNeeded} người
              </Badge>
              <Badge variant="outline">Tổng sức chứa: {dashboard.rooms_total_capacity} chỗ</Badge>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
