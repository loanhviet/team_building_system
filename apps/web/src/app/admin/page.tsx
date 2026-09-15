"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { EventDashboard } from "@/components/domain/event-dashboard";
import { apiFetch } from "@/lib/api";
import { useCurrentEventId } from "@/lib/use-current-event-id";
import type { Event, EventStatus } from "@/types/api";

const STATUS_RANK: Record<EventStatus, number> = {
  event_started: 0,
  information_published: 1,
  allocation_processing: 2,
  registration_open: 3,
  registration_closed: 4,
  draft: 5,
  event_completed: 6,
};

export default function AdminHomePage() {
  const [currentEventId] = useCurrentEventId();
  const { data: events } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch<Event[]>("/api/events"),
  });

  const ranked = [...(events ?? [])].sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || b.id - a.id,
  );
  const eventId = currentEventId ?? ranked[0]?.id ?? null;
  const event = events?.find((e) => e.id === eventId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Tổng quan</h1>
        {event ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {event.name}
            {" · "}
            <Link href={`/admin/events/${event.id}`} className="text-primary underline">
              Mở kỳ này
            </Link>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Chưa có sự kiện.</p>
        )}
      </div>
      {eventId != null && <EventDashboard eventId={eventId} />}
    </div>
  );
}
