"use client";

import { useEffect, useRef, useState } from "react";
import { galaSeatStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { GalaSeat, GalaState, GalaTable } from "@/types/api";

// 44px meets the minimum recommended touch target; the old 28px was roughly
// a third of that. CLUSTER (the per-table allocated box) grew to match so
// bigger seats don't spill into a neighboring table's box.
const SEAT_SIZE = 44;
const CLUSTER = 180;

const SEAT_TONE: Record<GalaSeat["status"], string> = {
  available:
    "bg-[var(--status-empty-bg)] border-[var(--status-empty-border)] text-[var(--status-empty-fg)]",
  held: "bg-[var(--status-locking-bg)] border-[var(--status-locking-border)] text-[var(--status-locking-fg)]",
  confirmed:
    "bg-[var(--status-confirmed-bg)] border-[var(--status-confirmed-border)] text-[var(--status-confirmed-fg)]",
  blocked:
    "bg-[var(--status-unavailable-bg)] border-[var(--status-unavailable-border)] text-[var(--status-unavailable-fg)]",
};

function seatOffset(index: number, count: number, shape: GalaTable["shape"]) {
  if (shape === "rect") {
    const perSide = Math.max(1, Math.ceil(count / 4));
    const side = Math.floor(index / perSide) % 4;
    const i = index % perSide;
    const t = perSide === 1 ? 0.5 : i / (perSide - 1);
    const w = 86;
    const h = 58;
    if (side === 0) return { x: (t - 0.5) * w, y: -h / 2 - 18 };
    if (side === 1) return { x: w / 2 + 18, y: (t - 0.5) * h };
    if (side === 2) return { x: (0.5 - t) * w, y: h / 2 + 18 };
    return { x: -w / 2 - 18, y: (0.5 - t) * h };
  }
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  const r = 52;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

export function GalaSeatMap({
  state,
  canSelect = false,
  isMyTurn = false,
  arrange = false,
  blockMode = false,
  teamNameById,
  onSeatClick,
  onTableMove,
}: {
  state: GalaState;
  canSelect?: boolean;
  isMyTurn?: boolean;
  arrange?: boolean;
  blockMode?: boolean;
  /** team_id -> tên Team, để hiện trên ghế đã confirmed. Chỉ cần cho các Team
   * đã có lượt (state.turns) — đủ vì ghế chỉ được confirm qua luồng lượt. */
  teamNameById?: Record<number, string>;
  onSeatClick?: (seat: GalaSeat) => void;
  onTableMove?: (tableId: number, x: number, y: number) => void;
}) {
  const floorRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number; x: number; y: number } | null>(null);
  const moveRef = useRef(onTableMove);
  const [livePos, setLivePos] = useState<Record<number, { x: number; y: number }>>({});

  useEffect(() => {
    moveRef.current = onTableMove;
  }, [onTableMove]);

  const tables = state.tables.filter((t) => t.is_active);
  const maxX = Math.max(640, ...tables.map((t) => (livePos[t.id]?.x ?? t.x) + CLUSTER + 24));
  const maxY = Math.max(380, ...tables.map((t) => (livePos[t.id]?.y ?? t.y) + CLUSTER + 24));

  useEffect(() => {
    if (!arrange) return;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      const floor = floorRef.current;
      if (!d || !floor) return;
      const rect = floor.getBoundingClientRect();
      const x = Math.max(0, Math.round(e.clientX - rect.left - d.dx));
      const y = Math.max(0, Math.round(e.clientY - rect.top - d.dy));
      d.x = x;
      d.y = y;
      setLivePos((prev) => ({ ...prev, [d.id]: { x, y } }));
    };
    const up = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      moveRef.current?.(d.id, d.x, d.y);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [arrange]);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground sm:hidden">Vuốt ngang/dọc để xem toàn bộ sơ đồ</p>
      <div className="overflow-auto border border-border bg-muted">
        <div className="bg-[var(--night)] px-4 py-3 text-center">
          <p className="font-display text-sm tracking-wide text-[var(--on-night)]">
            {state.config?.stage_label ?? "Sân khấu"}
          </p>
          <div className="mx-auto mt-2 h-1.5 w-2/3 bg-[var(--lantern)]/80" />
        </div>
        <div ref={floorRef} className="relative" style={{ width: maxX, height: maxY, minHeight: 380 }}>
          {tables.map((table) => {
            const pos = livePos[table.id] ?? { x: table.x, y: table.y };
            const seats = state.seats
              .filter((s) => s.table_id === table.id)
              .sort((a, b) => a.seat_number - b.seat_number);
            return (
              <div
                key={table.id}
                className={cn("absolute", arrange && "cursor-grab active:cursor-grabbing")}
                style={{ left: pos.x, top: pos.y, width: CLUSTER, height: CLUSTER }}
                onPointerDown={(e) => {
                  if (!arrange || blockMode) return;
                  if ((e.target as HTMLElement).closest("button[data-seat]")) return;
                  const rect = floorRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  drag.current = {
                    id: table.id,
                    dx: e.clientX - rect.left - pos.x,
                    dy: e.clientY - rect.top - pos.y,
                    x: pos.x,
                    y: pos.y,
                  };
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
              >
                <div
                  className={cn(
                    "absolute top-1/2 left-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center border border-[var(--night)]/20 bg-[var(--ticket)] shadow-[inset_0_0_0_6px_rgba(14,124,134,0.12)]",
                    table.shape === "round" ? "size-[72px] rounded-full" : "h-[58px] w-[86px] rounded-sm",
                  )}
                >
                  <p className="font-display text-sm leading-none">{table.code}</p>
                </div>
                {seats.map((seat, index) => {
                  const off = seatOffset(index, seats.length, table.shape);
                  const mineHeld = seat.held_by_team_id === state.my_team_id;
                  const mineConfirmed = seat.status === "confirmed" && seat.team_id === state.my_team_id;
                  const seatTeamName = seat.team_id != null ? teamNameById?.[seat.team_id] : undefined;
                  const canAct =
                    !arrange &&
                    !blockMode &&
                    canSelect &&
                    isMyTurn &&
                    (seat.status === "available" || mineHeld);
                  const statusText = galaSeatStatusLabel(seat.status);
                  const label = `Ghế ${seat.label ?? seat.seat_number} — ${statusText}${
                    seatTeamName ? ` (${seatTeamName})` : ""
                  }${mineConfirmed ? " — Team bạn" : ""}`;
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      data-seat
                      disabled={
                        blockMode
                          ? seat.status === "held" || seat.status === "confirmed"
                          : seat.status === "blocked" || (!canAct && !mineConfirmed && !blockMode)
                      }
                      onClick={() => onSeatClick?.(seat)}
                      title={label}
                      aria-label={label}
                      aria-pressed={mineHeld || mineConfirmed}
                      className={cn(
                        "absolute grid place-items-center border text-[11px] font-medium transition-colors duration-300",
                        table.shape === "round" ? "rounded-full" : "rounded-sm",
                        SEAT_TONE[seat.status],
                        // own team's confirmed seats get a distinct fill, not
                        // just a ring, so they stand out among every other
                        // team's identically-teal confirmed seats
                        mineConfirmed && "bg-[var(--lantern)] border-[var(--lantern)]",
                        (mineHeld || mineConfirmed) && "ring-2 ring-[var(--lantern)] ring-offset-1",
                      )}
                      style={{
                        width: SEAT_SIZE,
                        height: SEAT_SIZE,
                        left: CLUSTER / 2 + off.x - SEAT_SIZE / 2,
                        top: CLUSTER / 2 + off.y - SEAT_SIZE / 2,
                      }}
                    >
                      {seat.seat_number}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GalaLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      <span className="flex items-center gap-1.5">
        <span className="size-3 border border-[var(--status-empty-border)] bg-[var(--status-empty-bg)]" /> Trống
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 border border-[var(--status-locking-border)] bg-[var(--status-locking-bg)]" /> Đang giữ
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 border border-[var(--status-confirmed-border)] bg-[var(--status-confirmed-bg)]" /> Đã xác nhận
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 border border-[var(--status-unavailable-border)] bg-[var(--status-unavailable-bg)]" /> Không khả dụng
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 bg-[var(--lantern)] ring-2 ring-[var(--lantern)] ring-offset-1" /> Team bạn
      </span>
    </div>
  );
}
