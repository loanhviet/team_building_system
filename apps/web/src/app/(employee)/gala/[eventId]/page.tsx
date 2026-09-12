"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/domain/empty-state";
import { GalaLegend, GalaSeatMap } from "@/components/domain/gala-seat-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { applyGalaMessage } from "@/lib/gala-sync";
import { useGalaWebSocket } from "@/lib/use-gala-ws";
import type { GalaSeat, GalaState } from "@/types/api";

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      if (!expiresAt) {
        setRemaining(null);
        return;
      }
      setRemaining(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["events", eventId, "gala", "state"];
  const canSelect =
    user?.role === "team_leader" || user?.role === "organizer" || user?.role === "super_admin";

  const { data: state, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiFetch<GalaState>(`/api/events/${eventId}/gala/state`),
  });

  useGalaWebSocket(eventId, (raw) => {
    queryClient.setQueryData<GalaState | undefined>(queryKey, (prev) =>
      prev ? applyGalaMessage(prev, raw as Record<string, unknown>) : prev,
    );
  });

  const activeTurn = state?.turns.find((t) => t.status === "active");
  const remaining = useCountdown(activeTurn?.expires_at ?? null);
  const isMyTurn = canSelect && !!activeTurn && activeTurn.team_id === state?.my_team_id;
  const myConfirmedCount =
    state?.seats.filter((s) => s.status === "confirmed" && s.team_id === state.my_team_id).length ?? 0;

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

  const onSeatClick = (seat: GalaSeat) => {
    if (!isMyTurn) return;
    if (seat.status === "available") holdMutation.mutate(seat.id);
    else if (seat.status === "held" && seat.held_by_team_id === state?.my_team_id) {
      confirmMutation.mutate(seat.id);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải sơ đồ Gala...</p>;
  if (!state?.config) {
    return (
      <EmptyState
        title="Gala Dinner"
        description="BTC chưa cấu hình sơ đồ Gala cho sự kiện này."
      />
    );
  }

  const heldMine = state.seats.find((s) => s.held_by_team_id === state.my_team_id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="ticket-kicker">Sơ đồ chỗ ngồi</p>
          <h1 className="font-display text-3xl font-semibold">{state.config.name}</h1>
        </div>
        {activeTurn ? (
          <div className="flex items-center gap-2 text-sm">
            <span>
              Lượt của: <b>{activeTurn.team_name}</b> ({myConfirmedCount}/{activeTurn.seat_quota} ghế)
            </span>
            {remaining !== null && (
              <Badge variant={remaining < 10 ? "destructive" : "outline"}>{remaining}s</Badge>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {state.config.status === "drawing" ? "BTC đã bốc thăm, chờ bắt đầu lượt" : "Chưa bắt đầu bốc thăm"}
          </p>
        )}
      </div>

      {!canSelect && (
        <p className="text-xs text-muted-foreground">
          Bạn đang xem sơ đồ. Chỉ Trưởng nhóm được chọn ghế khi đến lượt Team.
        </p>
      )}

      <GalaSeatMap state={state} canSelect={canSelect} isMyTurn={isMyTurn} onSeatClick={onSeatClick} />

      {heldMine && isMyTurn && (
        <Button size="sm" variant="outline" className="self-start" onClick={() => releaseMutation.mutate(heldMine.id)}>
          Bỏ chọn ghế đang giữ
        </Button>
      )}

      <GalaLegend />
    </div>
  );
}
