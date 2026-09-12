"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import type { Dashboard, Event } from "@/types/api";

const SECTIONS = [
  { href: "/admin/events", title: "Sự kiện", description: "Tạo kỳ, cấu hình, chuyển trạng thái." },
  { href: "/admin/master-data", title: "Master Data", description: "Team và Địa điểm làm việc." },
  { href: "/admin/employees", title: "CBNV", description: "Danh sách nhân viên, import Excel." },
];

function BoardCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="board-cell">
      <p className="board-n">{value}</p>
      <p className="mt-1 text-xs text-white/55">{label}</p>
    </div>
  );
}

export default function AdminHomePage() {
  const { data: events } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch<Event[]>("/api/events"),
  });
  const [eventId, setEventId] = useState<number | null>(null);
  const currentEventId = eventId ?? events?.[events.length - 1]?.id ?? null;

  const { data: dashboard } = useQuery({
    queryKey: ["events", currentEventId, "dashboard"],
    queryFn: () => apiFetch<Dashboard>(`/api/events/${currentEventId}/dashboard`),
    enabled: currentEventId != null,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="ticket-kicker">Bàn điều hành</p>
          <h1 className="font-display text-3xl font-semibold">Tổng quan</h1>
        </div>
        {events && events.length > 0 && (
          <Select
            value={currentEventId ? String(currentEventId) : undefined}
            onValueChange={(v) => setEventId(Number(v))}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Chọn sự kiện" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {dashboard && (
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
                  <p className="text-sm text-muted-foreground">Chưa có chuyến bay</p>
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
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="block">
            <div className="ticket h-full hover:border-[var(--lagoon)]">
              <div className="ticket-spine" />
              <div className="ticket-body">
                <h2 className="font-display text-xl">{s.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
