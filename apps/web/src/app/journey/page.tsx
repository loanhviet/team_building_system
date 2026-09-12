"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Journey } from "@/types/api";

export default function JourneyPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const { data: journey, isLoading, error } = useQuery({
    queryKey: ["journey", "me"],
    queryFn: () => apiFetch<Journey>("/api/journey/me"),
    enabled: !!user,
    retry: false,
  });

  if (authLoading || !user || isLoading) {
    return <p className="p-6 text-sm text-zinc-500">Đang tải...</p>;
  }

  if (error) {
    const message = error instanceof ApiError ? error.message : "Có lỗi xảy ra";
    return (
      <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-medium">{message}</p>
        <p className="text-sm text-zinc-500">
          Nếu bạn chưa đăng ký, hãy{" "}
          <Link href="/register" className="underline">
            đăng ký tham gia
          </Link>{" "}
          trước.
        </p>
      </div>
    );
  }

  if (!journey) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{journey.event_name}</h1>
        <p className="text-sm text-zinc-500">
          {journey.full_name} — {journey.team_name ?? "—"}
        </p>
      </div>

      {journey.announcements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thông báo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {journey.announcements.map((a, i) => (
              <div key={i} className="border-b pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{a.title}</p>
                  {a.is_pinned && <Badge variant="secondary">Ghim</Badge>}
                </div>
                <p className="text-sm text-zinc-500 whitespace-pre-wrap">{a.body_md}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chuyến bay</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {journey.flights.length === 0 && (
            <p className="text-sm text-zinc-500">Chưa có thông tin</p>
          )}
          {journey.flights.map((f, i) => (
            <div key={i} className="flex flex-col gap-1 text-sm">
              <p className="font-medium">
                {f.direction === "outbound" ? "Chiều đi" : "Chiều về"}: {f.flight_code}
              </p>
              <p className="text-zinc-500">
                {f.origin ?? "—"} → {f.destination ?? "—"}
              </p>
              {f.depart_at && (
                <p className="text-zinc-500">
                  Khởi hành: {new Date(f.depart_at).toLocaleString("vi-VN")}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Xe đưa đón</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {journey.buses.length === 0 && <p className="text-sm text-zinc-500">Chưa có thông tin</p>}
          {journey.buses.map((b, i) => (
            <div key={i} className="flex flex-col gap-1 text-sm">
              <p className="font-medium">
                {b.leg_name}: xe {b.bus_code}
              </p>
              {b.gather_at && (
                <p className="text-zinc-500">
                  Tập trung: {new Date(b.gather_at).toLocaleString("vi-VN")}
                </p>
              )}
              {b.leader_name && (
                <p className="text-zinc-500">
                  Trưởng xe: {b.leader_name} {b.leader_phone && `(${b.leader_phone})`}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Khách sạn</CardTitle>
        </CardHeader>
        <CardContent>
          {journey.room ? (
            <p className="text-sm">
              {journey.room.hotel_name} — Phòng {journey.room.room_number}
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Chưa có thông tin</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lịch trình</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {journey.schedule.length === 0 && (
            <p className="text-sm text-zinc-500">Chưa có lịch trình</p>
          )}
          {journey.schedule.map((s, i) => (
            <div key={i} className="border-l-2 pl-3 text-sm">
              <p className="font-medium">{s.title}</p>
              <p className="text-zinc-500">
                {s.day_date ?? ""} {s.start_at ? new Date(s.start_at).toLocaleTimeString("vi-VN") : ""}
                {s.location ? ` — ${s.location}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
