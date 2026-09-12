"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Event, Journey } from "@/types/api";

export function useEmployeeEvent() {
  const { user } = useAuth();

  const journeyQuery = useQuery({
    queryKey: ["journey", "me"],
    queryFn: () => apiFetch<Journey>("/api/journey/me"),
    enabled: !!user,
    retry: false,
    throwOnError: false,
  });

  const currentQuery = useQuery({
    queryKey: ["events", "current"],
    queryFn: () => apiFetch<Event | null>("/api/events/current"),
    enabled: !!user && journeyQuery.isFetched && !journeyQuery.data,
    retry: false,
  });

  const journey = journeyQuery.data;
  const current = currentQuery.data;
  const eventId = journey?.event_id ?? current?.id ?? null;
  const eventName = journey?.event_name ?? current?.name ?? null;

  return {
    eventId,
    eventName,
    journey,
    hasJourney: !!journey,
    isLeader: user?.role === "team_leader",
    galaStatus: journey?.gala?.status ?? null,
    isLoading: journeyQuery.isLoading || (!journey && currentQuery.isLoading),
  };
}
