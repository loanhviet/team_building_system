"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </CardContent>
    </Card>
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
          <h1 className="text-2xl font-semibold">Tổng quan</h1>
          <p className="text-sm text-zinc-500">Khu vực quản trị hệ thống Team Building.</p>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Tổng CBNV" value={dashboard.total_employees} />
            <StatCard label="Đã đăng ký" value={dashboard.registered_count} />
            <StatCard label="Chưa đăng ký" value={dashboard.not_registered_count} />
            <StatCard label="Tham gia" value={dashboard.participating_count} />
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
                  <p className="text-sm text-zinc-500">Chưa có dữ liệu</p>
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
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-colors hover:border-zinc-400">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
