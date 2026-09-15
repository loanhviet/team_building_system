"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { EventSettings } from "@/types/api";

export function AllocationWeightsHint({
  eventId,
  kind,
}: {
  eventId: number;
  kind: "flight" | "bus";
}) {
  const { data } = useQuery({
    queryKey: ["events", eventId, "settings"],
    queryFn: () => apiFetch<EventSettings>(`/api/events/${eventId}/settings`),
  });
  if (!data) return null;

  const line =
    kind === "flight"
      ? `Đúng ca ${data.flight_allocation_weights.same_shift}% · Cùng team ${data.flight_allocation_weights.team_together}% · Lấp đầy ${data.flight_allocation_weights.fill_rate}% · Phạt tách ${data.flight_allocation_weights.split_penalty}%`
      : `Cùng chuyến ${data.bus_allocation_weights.same_flight}% · Cùng team ${data.bus_allocation_weights.team_together}% · Lấp đầy ${data.bus_allocation_weights.fill_rate}%`;

  return (
    <p className="text-xs text-muted-foreground">
      Phân bổ tự động dùng trọng số từ{" "}
      <Link href={`/admin/events/${eventId}/settings`} className="font-medium text-primary hover:underline">
        Cấu hình
      </Link>
      : {line}
    </p>
  );
}
