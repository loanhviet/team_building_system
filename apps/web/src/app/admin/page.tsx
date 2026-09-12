"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { EventDashboard } from "@/components/domain/event-dashboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import type { Event } from "@/types/api";

const SECTIONS = [
  { href: "/admin/events", title: "Sự kiện", description: "Tạo kỳ, cấu hình, chuyển trạng thái." },
  { href: "/admin/master-data", title: "Master Data", description: "Team và Địa điểm làm việc." },
  { href: "/admin/employees", title: "CBNV", description: "Danh sách nhân viên, import Excel." },
];

export default function AdminHomePage() {
  const { data: events } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch<Event[]>("/api/events"),
  });
  // The event actually open for registration is what BTC almost always
  // wants to see first — falling back to "highest id" (the old default)
  // meant landing on a draft/completed event whenever a newer one existed
  // but wasn't yet open.
  const { data: currentEvent } = useQuery({
    queryKey: ["events", "current"],
    queryFn: () => apiFetch<Event | null>("/api/events/current"),
  });
  const [manualEventId, setManualEventId] = useState<number | null>(null);
  const currentEventId =
    manualEventId ?? currentEvent?.id ?? events?.[events.length - 1]?.id ?? null;

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
            onValueChange={(v) => setManualEventId(Number(v))}
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

      {currentEventId != null && <EventDashboard eventId={currentEventId} />}

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
