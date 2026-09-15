"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, MapPin, Search, Star, Trash2, Users } from "lucide-react";
import { use, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/domain/empty-state";
import { GalaSeatMap } from "@/components/domain/gala-seat-map";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { PageSkeleton } from "@/components/domain/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { applyGalaMessage } from "@/lib/gala-sync";
import { galaConfigStatusLabel } from "@/lib/labels";
import { useCountdown } from "@/lib/use-countdown";
import { useEmployeeEvent } from "@/lib/use-employee-event";
import { useGalaWebSocket } from "@/lib/use-gala-ws";
import { cn } from "@/lib/utils";
import type { GalaSeat, GalaState, GalaTable, TeamRoster } from "@/types/api";

type Filter = "all" | "mine" | "empty";

function mmss(seconds: number | null) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function tableFill(state: GalaState, tableId: number) {
  const seats = state.seats.filter((s) => s.table_id === tableId);
  const available = seats.filter((s) => s.status === "available").length;
  return { seats, available, total: seats.length };
}

export default function GalaSeatMapPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventIdStr } = use(params);
  const eventId = Number(eventIdStr);
  const { user } = useAuth();
  const { event, isLeader } = useEmployeeEvent();
  const queryClient = useQueryClient();
  const queryKey = ["events", eventId, "gala", "state"];
  const canSelect =
    user?.role === "team_leader" || user?.role === "organizer" || user?.role === "super_admin";
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const { data: state, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiFetch<GalaState>(`/api/events/${eventId}/gala/state`),
  });

  const { data: roster } = useQuery({
    queryKey: ["events", eventId, "team", "roster"],
    queryFn: () => apiFetch<TeamRoster>(`/api/events/${eventId}/team/roster`),
    enabled: !!eventId && isLeader,
    retry: false,
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
  const confirmedMine = (state?.seats ?? []).filter(
    (s) => s.status === "confirmed" && s.team_id === state?.my_team_id,
  );
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

  const confirmHeld = () => {
    for (const seat of heldMine) confirmMutation.mutate(seat.id);
  };

  const suggested = useMemo(() => {
    if (!state) return [];
    return state.tables
      .filter((t) => t.is_active)
      .map((t) => ({ table: t, ...tableFill(state, t.id) }))
      .filter((t) => t.available > 0)
      .sort((a, b) => b.available - a.available)
      .slice(0, 2);
  }, [state]);

  const filteredState = useMemo(() => {
    if (!state) return state;
    const q = query.trim().toLowerCase();
    let tables = state.tables.filter((t) => t.is_active);
    if (q) {
      tables = tables.filter(
        (t) =>
          t.code.toLowerCase().includes(q) ||
          (t.name ?? "").toLowerCase().includes(q),
      );
    }
    if (filter === "mine") {
      const mineTableIds = new Set(
        [...heldMine, ...confirmedMine].map((s) => s.table_id),
      );
      tables =
        mineTableIds.size > 0
          ? tables.filter((t) => mineTableIds.has(t.id))
          : tables.filter((t) => tableFill(state, t.id).available > 0);
    } else if (filter === "empty") {
      tables = tables
        .filter((t) => tableFill(state, t.id).available > 0)
        .sort((a, b) => tableFill(state, b.id).available - tableFill(state, a.id).available);
    }
    return { ...state, tables };
  }, [state, query, filter, heldMine, confirmedMine]);

  if (isLoading) return <PageSkeleton />;
  if (!state?.config) {
    return (
      <EmptyState
        title="Gala Dinner"
        description="BTC chưa cấu hình sơ đồ Gala cho sự kiện này."
      />
    );
  }

  const myTeamName =
    (state.my_team_id != null ? teamNameById[state.my_team_id] : null) ?? user?.team_name ?? "Team bạn";
  const quota = activeTurn?.seat_quota ?? confirmedMine.length + heldMine.length;
  const clock = mmss(isMyTurn ? remaining : holdRemaining);

  return (
    <div className="flex flex-col">
      <div className="bg-gradient-to-r from-primary to-[#034e47] px-4 py-5 text-primary-foreground sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold">
              Đêm hội kết nối
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {state.config.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
              {event?.destination && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {event.destination}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn("size-2 rounded-full", connected ? "bg-white" : "bg-destructive")}
                  aria-hidden
                />
                {connected ? "Đang cập nhật trực tiếp" : "Mất kết nối, đang thử lại..."}
              </span>
            </p>
          </div>
          {suggested.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-md">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--ember)] text-white">
                <Star className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-orange-200">
                  Gợi ý phân bổ chỗ ngồi
                </p>
                <p>
                  Ưu tiên {myTeamName}:{" "}
                  {suggested.map((s) => (
                    <span
                      key={s.table.id}
                      className="ml-1 inline-block rounded bg-white px-1.5 py-0.5 text-xs font-bold text-primary"
                    >
                      {s.table.code}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl items-start gap-6 px-4 py-6 lg:grid-cols-12">
        <section className="surface-card overflow-hidden lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-slate-50/80 px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="mr-1 text-muted-foreground">Lọc:</span>
              {(
                [
                  ["all", "Tất cả"],
                  ["mine", "Khu vực đội mình"],
                  ["empty", "Còn nhiều chỗ trống"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 font-semibold",
                    filter === id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{galaConfigStatusLabel(state.config.status)}</p>
          </div>

          <div className="p-4">
            {activeTurn && (
              <p className="mb-3 text-sm">
                {isMyTurn ? (
                  <span className="font-semibold text-primary">
                    Lượt team bạn · {activeTeamConfirmedCount}/{activeTurn.seat_quota} ghế
                    {clock ? ` · ${clock}` : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Lượt của {activeTurn.team_name}
                    {remaining != null ? ` · còn ${mmss(remaining)}` : ""}
                  </span>
                )}
              </p>
            )}
            {myWaitPosition !== null && (
              <p className="mb-3 text-sm text-muted-foreground">
                Team bạn: thứ <b className="text-foreground">{myWaitPosition}</b> trong hàng chờ
              </p>
            )}
            {!canSelect && (
              <p className="mb-3 text-xs text-muted-foreground">
                Bạn đang xem sơ đồ. Chỉ Trưởng nhóm được chọn ghế khi đến lượt Team.
              </p>
            )}
            {orderedTurns.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
                {orderedTurns.map((t) => (
                  <span
                    key={t.id}
                    className={cn(
                      "rounded-full border px-2 py-0.5",
                      t.status === "active" && "border-primary bg-primary/10 font-medium",
                      t.status === "done" && "border-transparent text-muted-foreground line-through",
                      t.status === "waiting" && "border-[var(--rule)] text-muted-foreground",
                      (t.status === "skipped" || t.status === "expired") &&
                        "border-transparent text-muted-foreground/60",
                      t.team_id === state.my_team_id && "ring-1 ring-[var(--lantern)]",
                    )}
                  >
                    {t.order_no}. {t.team_name}
                  </span>
                ))}
              </div>
            )}
            {filteredState && (
              <GalaSeatMap
                state={filteredState}
                canSelect={canSelect}
                isMyTurn={isMyTurn}
                teamNameById={teamNameById}
                onSeatClick={onSeatClick}
              />
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-span-4">
          <section className="surface-card p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Search className="size-4 text-primary" aria-hidden="true" />
              Tìm kiếm vị trí
            </p>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Bàn 08, mã bàn…"
              className="h-10"
            />
          </section>

          <section className="surface-card p-4">
            <p className="mb-3 text-sm font-bold">Chú thích trạng thái ghế</p>
            <ul className="grid grid-cols-2 gap-2 text-xs">
              <LegendDot className="border-[var(--status-empty-border)] bg-[var(--status-empty-bg)]" label="Ghế trống sẵn sàng" />
              <LegendDot className="border-[var(--status-locking-border)] bg-[var(--status-locking-bg)]" label="Đang giữ chỗ" />
              <LegendDot className="border-[var(--status-confirmed-border)] bg-[var(--status-confirmed-bg)]" label="Đã có người ngồi" />
              <LegendDot className="border-[var(--lantern)] bg-[var(--lantern)]/15" label="Ghế đội mình" />
              <LegendDot className="border-[var(--status-unavailable-border)] bg-[var(--status-unavailable-bg)]" label="Không khả dụng" />
            </ul>
          </section>

          {isMyTurn && (
            <section className="overflow-hidden rounded-2xl border-2 border-orange-200 bg-orange-50">
              <div className="flex items-center justify-between bg-[var(--ember)] px-4 py-2 text-sm font-bold text-white">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden="true" />
                  Thời gian giữ chỗ của bạn
                </span>
                <span className="font-mono tabular">{clock ?? "—"}</span>
              </div>
              <div className="space-y-3 p-4">
                <p className="text-xs font-semibold text-muted-foreground">Vị trí lựa chọn</p>
                {heldMine.length === 0 && confirmedMine.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa chọn ghế. Bấm một ghế trống trên sơ đồ để giữ.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {heldMine.map((seat) => (
                      <HeldRow
                        key={seat.id}
                        seat={seat}
                        tables={state.tables}
                        pending
                        onRelease={() => releaseMutation.mutate(seat.id)}
                      />
                    ))}
                    {confirmedMine.map((seat) => (
                      <HeldRow key={seat.id} seat={seat} tables={state.tables} />
                    ))}
                  </ul>
                )}
                {roster && roster.members.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      Đồng đội ngồi cùng bàn ({roster.members.length})
                    </p>
                    <ul className="space-y-1">
                      {roster.members.slice(0, 6).map((m) => (
                        <li key={m.employee_id} className="flex items-center gap-2 text-xs">
                          <InitialsAvatar name={m.full_name} className="size-7 text-[10px]" />
                          <span className="min-w-0 flex-1 truncate font-medium">{m.full_name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button
                  className="h-12 w-full"
                  disabled={heldMine.length === 0 || confirmMutation.isPending}
                  onClick={confirmHeld}
                >
                  <Check className="size-4" aria-hidden="true" />
                  Xác nhận vị trí
                </Button>
              </div>
            </section>
          )}

          {!isMyTurn && (
            <section className="surface-card p-4">
              <p className="text-sm font-bold">Ghế team bạn</p>
              {confirmedMine.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Chưa có ghế đã xác nhận.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {confirmedMine.map((seat) => (
                    <HeldRow key={seat.id} seat={seat} tables={state.tables} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {suggested.length > 0 && (
            <section className="surface-card p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Users className="size-4 text-primary" aria-hidden="true" />
                Gợi ý bàn còn chỗ
              </p>
              <ul className="space-y-2">
                {suggested.map((s) => (
                  <li key={s.table.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span>
                      <span className="font-semibold">{s.table.code}</span>
                      {s.table.name ? ` · ${s.table.name}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Còn {s.available}/{s.total}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {quota > 0 && isMyTurn && (
            <p className="px-1 text-xs text-muted-foreground">
              Hạn mức lượt này: {activeTeamConfirmedCount + heldMine.length}/{quota} ghế.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("size-3.5 rounded-full border", className)} />
      {label}
    </li>
  );
}

function HeldRow({
  seat,
  tables,
  pending,
  onRelease,
}: {
  seat: GalaSeat;
  tables: GalaTable[];
  pending?: boolean;
  onRelease?: () => void;
}) {
  const table = tables.find((t) => t.id === seat.table_id);
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span>
        <span className="font-semibold">
          {table?.code ?? "Bàn"} — Ghế {seat.label ?? seat.seat_number}
        </span>
        {pending && <span className="ml-2 text-[11px] font-bold text-orange-700">Đang giữ</span>}
        {!pending && <span className="ml-2 text-[11px] font-bold text-emerald-700">Đã xác nhận</span>}
      </span>
      {onRelease && (
        <button
          type="button"
          onClick={onRelease}
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
          aria-label="Bỏ chọn ghế"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}
