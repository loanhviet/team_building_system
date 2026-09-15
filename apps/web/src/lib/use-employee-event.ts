"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { EmployeeEvent, GalaConfig } from "@/types/api";

const STORAGE_KEY = "employee:currentEventId";

function pickDefault(events: EmployeeEvent[]): number | null {
  if (events.length === 0) return null;
  const ranked = [...events].sort((a, b) => {
    const score = (e: EmployeeEvent) => (e.has_journey ? 0 : 2) + (e.can_register ? 0 : 1);
    return score(a) - score(b) || b.id - a.id;
  });
  return ranked[0].id;
}

type EmployeeEventValue = {
  events: EmployeeEvent[];
  event: EmployeeEvent | null;
  eventId: number | null;
  eventName: string | null;
  eventStatus: EmployeeEvent["status"] | null;
  canRegister: boolean;
  hasJourney: boolean;
  isLeader: boolean;
  galaConfig: GalaConfig | null;
  isLoading: boolean;
  setEventId: (id: number) => void;
};

const EmployeeEventContext = createContext<EmployeeEventValue | null>(null);

export function EmployeeEventProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setSelectedId(Number(stored));
    } catch {
      /* ignore */
    }
  }, []);

  const setEventId = useCallback((next: number) => {
    setSelectedId(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  const { data: mine = [], isLoading } = useQuery({
    queryKey: ["events", "mine"],
    queryFn: () => apiFetch<EmployeeEvent[]>("/api/events/mine"),
    enabled: !!user,
  });

  const effectiveId =
    selectedId != null && mine.some((event) => event.id === selectedId)
      ? selectedId
      : pickDefault(mine);

  const event = useMemo(
    () => mine.find((e) => e.id === effectiveId) ?? null,
    [mine, effectiveId],
  );

  const { data: galaConfig } = useQuery({
    queryKey: ["events", event?.id, "gala", "config"],
    queryFn: () => apiFetch<GalaConfig | null>(`/api/events/${event!.id}/gala/config`),
    enabled: !!event,
  });

  const value: EmployeeEventValue = {
    events: mine,
    event,
    eventId: event?.id ?? null,
    eventName: event?.name ?? null,
    eventStatus: event?.status ?? null,
    canRegister: !!event?.can_register,
    hasJourney: !!event?.has_journey,
    isLeader: user?.role === "team_leader",
    galaConfig: galaConfig ?? null,
    isLoading,
    setEventId,
  };

  return createElement(EmployeeEventContext.Provider, { value }, children);
}

export function useEmployeeEvent() {
  const ctx = useContext(EmployeeEventContext);
  if (!ctx) {
    throw new Error("useEmployeeEvent must be used within EmployeeEventProvider");
  }
  return ctx;
}
