"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
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

export default function EventOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);

  const { data: dashboard } = useQuery({
    queryKey: ["events", eventId, "dashboard"],
    queryFn: () => apiFetch<Dashboard>(`/api/events/${eventId}/dashboard`),
  });

  if (!dashboard) {
    return <p className="text-sm text-muted-foreground">Đang tải số liệu...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="board grid-cols-2 sm:grid-cols-4">
        <BoardCell label="Tổng CBNV" value={dashboard.total_employees} />
        <BoardCell label="Đã đăng ký" value={dashboard.registered_count} />
        <BoardCell label="Chưa đăng ký" value={dashboard.not_registered_count} />
        <BoardCell label="Tham gia" value={dashboard.participating_count} />
      </div>
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
            {dashboard.by_shift.length === 0 && <p className="text-sm text-zinc-500">Chưa có dữ liệu</p>}
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
              <p className="text-sm text-zinc-500">Chưa có dữ liệu</p>
            )}
          </CardContent>
        </Card>
        <Card>
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
              <p className="text-sm text-zinc-500">Chưa có chuyến bay</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Phân xe / phòng</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="outline">Đã lên xe: {dashboard.buses_assigned}</Badge>
            <Badge variant="outline">
              Phòng: {dashboard.rooms_assigned}/{dashboard.rooms_total_capacity} chỗ
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
