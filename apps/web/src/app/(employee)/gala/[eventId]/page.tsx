"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/domain/empty-state";
import { GalaLegend, GalaSeatMap } from "@/components/domain/gala-seat-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { applyGalaMessage } from "@/lib/gala-sync";
import { galaConfigStatusLabel } from "@/lib/labels";
import { useCountdown } from "@/lib/use-countdown";
import { useGalaWebSocket } from "@/lib/use-gala-ws";
import { cn } from "@/lib/utils";
import type { GalaSeat, GalaState } from "@/types/api";

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

  const { connected } = useGalaWebSocket(
    eventId,
    (raw) => {
      queryClient.setQueryData<GalaState | undefined>(queryKey, (prev) =>
        prev ? applyGalaMessage(prev, raw as Record<string, unknown>) : prev,
      );
    },
    () => queryClient.invalidateQueries({ queryKey }),
  );

  const orderedTurns = [...(state?.turns ?? [])].sort((a, b) => a.order_no - b.order_no);
  const activeTurn = orderedTurns.find((t) => t.status === "active");
  const remaining = useCountdown(activeTurn?.expires_at ?? null);
  const isMyTurn = canSelect && !!activeTurn && activeTurn.team_id === state?.my_team_id;
  // the quota progress shown must always be *the team whose turn it is*, not
  // the viewer's own team — showing "my" count next to someone else's quota
  // was the actual bug here
  const activeTeamConfirmedCount =
    state?.seats.filter((s) => s.status === "confirmed" && s.team_id === activeTurn?.team_id)
      .length ?? 0;

  const teamNameById: Record<number, string> = {};
  for (const t of orderedTurns) teamNameById[t.team_id] = t.team_name ?? `Team #${t.team_id}`;

  const myTurnIndex = orderedTurns.findIndex((t) => t.team_id === state?.my_team_id);
  const myWaitPosition =
    myTurnIndex >= 0 && orderedTurns[myTurnIndex]?.status === "waiting"
      ? orderedTurns.filter((t, i) => i <= myTurnIndex && t.status === "waiting").length
      : null;

  const heldMine = (state?.seats ?? []).filter((s) => s.held_by_team_id === state?.my_team_id);
  // called unconditionally (before any early return) — hooks can't be
  // called conditionally, so this can't move down next to where it's used
  const holdRemaining = useCountdown(heldMine[0]?.hold_expires_at ?? null);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="ticket-kicker">Sơ đồ chỗ ngồi</p>
          <h1 className="font-display text-3xl font-semibold">{state.config.name}</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-destructive")}
            aria-hidden
          />
          {connected ? "Đang cập nhật trực tiếp" : "Mất kết nối, đang thử lại..."}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {activeTurn ? (
          <div className="flex items-center gap-2 text-sm">
            <span>
              Lượt của: <b>{activeTurn.team_name}</b> ({activeTeamConfirmedCount}/{activeTurn.seat_quota} ghế)
            </span>
            {remaining !== null && (
              <Badge variant={remaining < 10 ? "destructive" : "outline"}>{remaining}s</Badge>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{galaConfigStatusLabel(state.config.status)}</p>
        )}
        {myWaitPosition !== null && (
          <p className="text-sm text-muted-foreground">
            Team bạn: thứ <b>{myWaitPosition}</b> trong hàng chờ
          </p>
        )}
      </div>

      {orderedTurns.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {orderedTurns.map((t) => (
            <span
              key={t.id}
              className={cn(
                "rounded-full border px-2 py-0.5",
                t.status === "active" && "border-primary bg-primary/10 font-medium",
                t.status === "done" && "border-transparent text-muted-foreground line-through",
                t.status === "waiting" && "border-[var(--rule)] text-muted-foreground",
                t.status === "skipped" && "border-transparent text-muted-foreground/60 line-through",
                t.status === "expired" && "border-transparent text-muted-foreground/60",
                t.team_id === state.my_team_id && "ring-1 ring-[var(--lantern)]",
              )}
            >
              {t.order_no}. {t.team_name}
            </span>
          ))}
        </div>
      )}

      {!canSelect && (
        <p className="text-xs text-muted-foreground">
          Bạn đang xem sơ đồ. Chỉ Trưởng nhóm được chọn ghế khi đến lượt Team.
        </p>
      )}

      <GalaSeatMap
        state={state}
        canSelect={canSelect}
        isMyTurn={isMyTurn}
        teamNameById={teamNameById}
        onSeatClick={onSeatClick}
      />

      {heldMine.length > 0 && isMyTurn && (
        <div className="flex flex-wrap items-center gap-2">
          {heldMine.map((seat) => (
            <Button
              key={seat.id}
              size="sm"
              variant="outline"
              onClick={() => releaseMutation.mutate(seat.id)}
            >
              Bỏ chọn ghế {seat.label ?? seat.seat_number}
            </Button>
          ))}
          {holdRemaining !== null && (
            <span className="text-xs text-muted-foreground">
              Giữ ghế còn {holdRemaining}s trước khi tự nhả
            </span>
          )}
        </div>
      )}

      <GalaLegend />
    </div>
  );
}
