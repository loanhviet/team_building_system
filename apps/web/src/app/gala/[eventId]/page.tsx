"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { useGalaWebSocket } from "@/lib/use-gala-ws";
import type { GalaSeat, GalaState } from "@/types/api";

const SEAT_COLOR: Record<string, string> = {
  available: "bg-white border-zinc-300 dark:bg-zinc-900 dark:border-zinc-700",
  held: "bg-amber-200 border-amber-400",
  confirmed: "bg-emerald-200 border-emerald-500",
  blocked: "bg-zinc-300 border-zinc-400 cursor-not-allowed",
};

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      if (!expiresAt) {
        setRemaining(null);
        return;
      }
      const target = new Date(expiresAt).getTime();
      setRemaining(Math.max(0, Math.round((target - Date.now()) / 1000)));
    };
    tick();
    if (!expiresAt) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

export default function GalaSeatMapPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventIdStr } = use(params);
  const eventId = Number(eventIdStr);
  const queryClient = useQueryClient();
  const queryKey = ["events", eventId, "gala", "state"];

  const { data: state, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiFetch<GalaState>(`/api/events/${eventId}/gala/state`),
  });

  useGalaWebSocket(eventId, (raw) => {
    const msg = raw as { type: string } & Record<string, unknown>;
    queryClient.setQueryData<GalaState | undefined>(queryKey, (prev) => {
      if (!prev) return prev;
      if (msg.type === "seat_update") {
        return {
          ...prev,
          seats: prev.seats.map((s) =>
            s.id === msg.seat_id
              ? {
                  ...s,
                  status: msg.status as GalaSeat["status"],
                  held_by_team_id: (msg.held_by_team_id as number | undefined) ?? null,
                  team_id: (msg.team_id as number | undefined) ?? s.team_id,
                }
              : s,
          ),
        };
      }
      if (msg.type === "turn_update") {
        return {
          ...prev,
          turns: prev.turns.map((t) =>
            t.team_id === msg.team_id
              ? { ...t, status: "active", expires_at: msg.expires_at as string | null }
              : t.status === "active"
                ? { ...t, status: "done" }
                : t,
          ),
        };
      }
      return prev;
    });
  });

  const activeTurn = state?.turns.find((t) => t.status === "active");
  const remaining = useCountdown(activeTurn?.expires_at ?? null);
  const isMyTurn = !!activeTurn && activeTurn.team_id === state?.my_team_id;
  const myConfirmedCount = state?.seats.filter(
    (s) => s.status === "confirmed" && s.team_id === state.my_team_id,
  ).length ?? 0;

  const holdMutation = useMutation({
    mutationFn: (seatId: number) =>
      apiFetch<GalaSeat>(`/api/events/${eventId}/gala/seats/${seatId}/hold`, { method: "POST" }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Ghế đã có người chọn"),
  });

  const confirmMutation = useMutation({
    mutationFn: (seatId: number) =>
      apiFetch<GalaSeat>(`/api/events/${eventId}/gala/seats/${seatId}/confirm`, { method: "POST" }),
    onSuccess: () => toast.success("Đã xác nhận ghế"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const releaseMutation = useMutation({
    mutationFn: (seatId: number) =>
      apiFetch(`/api/events/${eventId}/gala/seats/${seatId}/release`, { method: "POST" }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  if (isLoading) return <p className="p-6 text-sm text-zinc-500">Đang tải...</p>;
  if (!state?.config) {
    return <p className="p-6 text-sm text-zinc-500">Gala Dinner chưa được cấu hình cho sự kiện này.</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{state.config.name}</h1>
        {activeTurn ? (
          <div className="flex items-center gap-2 text-sm">
            <span>
              Lượt của: <b>{activeTurn.team_name}</b> ({myConfirmedCount}/{activeTurn.seat_quota} ghế)
            </span>
            {remaining !== null && <Badge variant={remaining < 10 ? "destructive" : "outline"}>{remaining}s</Badge>}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Chưa bắt đầu bốc thăm</p>
        )}
      </div>

      <div className="rounded-md bg-zinc-100 py-2 text-center text-sm font-medium dark:bg-zinc-800">
        {state.config.stage_label}
      </div>

      <div className="relative min-h-[400px] overflow-auto rounded-md border p-4">
        {state.tables.map((table) => {
          const seats = state.seats.filter((s) => s.table_id === table.id);
          return (
            <div
              key={table.id}
              className="absolute flex flex-col items-center gap-1"
              style={{ left: table.x, top: table.y }}
            >
              <p className="text-xs font-medium">{table.code}</p>
              <div className="grid grid-cols-4 gap-1">
                {seats.map((seat) => {
                  const isMine = seat.held_by_team_id === state.my_team_id;
                  const canAct = isMyTurn && (seat.status === "available" || isMine);
                  return (
                    <button
                      key={seat.id}
                      disabled={seat.status === "blocked" || (!canAct && seat.status !== "confirmed")}
                      onClick={() => {
                        if (seat.status === "available" && isMyTurn) holdMutation.mutate(seat.id);
                        else if (seat.status === "held" && isMine) confirmMutation.mutate(seat.id);
                      }}
                      className={`h-8 w-8 rounded border text-[10px] ${SEAT_COLOR[seat.status]} ${
                        isMine ? "ring-2 ring-blue-500" : ""
                      }`}
                      title={`Ghế ${seat.seat_number} — ${seat.status}`}
                    >
                      {seat.seat_number}
                    </button>
                  );
                })}
              </div>
              {seats.some((s) => s.held_by_team_id === state.my_team_id) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => {
                    const held = seats.find((s) => s.held_by_team_id === state.my_team_id);
                    if (held) releaseMutation.mutate(held.id);
                  }}
                >
                  Bỏ chọn
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border bg-white dark:bg-zinc-900" /> Trống
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border bg-amber-200" /> Đang được chọn
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border bg-emerald-200" /> Đã xác nhận
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border bg-zinc-300" /> Không khả dụng
        </span>
      </div>
    </div>
  );
}
