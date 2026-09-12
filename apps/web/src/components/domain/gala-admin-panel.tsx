"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { GalaLegend, GalaSeatMap } from "@/components/domain/gala-seat-map";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { applyGalaMessage } from "@/lib/gala-sync";
import { useGalaWebSocket } from "@/lib/use-gala-ws";
import type { GalaConfig, GalaSeat, GalaState, GalaTable, GalaTurn } from "@/types/api";

export function GalaAdminPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const queryKey = ["events", eventId, "gala", "state"];
  const [configOpen, setConfigOpen] = useState(false);
  const [name, setName] = useState("Gala Dinner");
  const [stageLabel, setStageLabel] = useState("Sân khấu");
  const [turnDuration, setTurnDuration] = useState("60");
  const [holdTtl, setHoldTtl] = useState("30");
  const [tableOpen, setTableOpen] = useState(false);
  const [tableCode, setTableCode] = useState("");
  const [tableSeatCount, setTableSeatCount] = useState("8");
  const [tableShape, setTableShape] = useState<"round" | "rect">("round");
  const [blockMode, setBlockMode] = useState(false);

  const { data: state } = useQuery({
    queryKey,
    queryFn: () => apiFetch<GalaState>(`/api/events/${eventId}/gala/state`),
  });

  useGalaWebSocket(eventId, (raw) => {
    queryClient.setQueryData<GalaState | undefined>(queryKey, (prev) =>
      prev ? applyGalaMessage(prev, raw as Record<string, unknown>) : prev,
    );
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveConfigMutation = useMutation({
    mutationFn: () =>
      apiFetch<GalaConfig>(`/api/events/${eventId}/gala/config`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          stage_label: stageLabel,
          turn_duration_seconds: Number(turnDuration),
          hold_ttl_seconds: Number(holdTtl),
        }),
      }),
    onSuccess: () => {
      toast.success("Đã lưu cấu hình Gala");
      setConfigOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const createTableMutation = useMutation({
    mutationFn: () =>
      apiFetch<GalaTable>(`/api/events/${eventId}/gala/tables`, {
        method: "POST",
        body: JSON.stringify({
          code: tableCode,
          seat_count: Number(tableSeatCount),
          shape: tableShape,
        }),
      }),
    onSuccess: () => {
      toast.success("Đã thêm bàn");
      setTableOpen(false);
      setTableCode("");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const drawMutation = useMutation({
    mutationFn: () => apiFetch<GalaTurn[]>(`/api/events/${eventId}/gala/draw`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Đã bốc thăm. Bấm Bắt đầu lượt khi sẵn sàng.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const startMutation = useMutation({
    mutationFn: () => apiFetch<GalaTurn>(`/api/events/${eventId}/gala/turns/start`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Đã bắt đầu lượt");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const skipMutation = useMutation({
    mutationFn: () => apiFetch<GalaTurn[]>(`/api/events/${eventId}/gala/turns/skip`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Đã bỏ qua lượt");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, x, y }: { id: number; x: number; y: number }) =>
      apiFetch<GalaTable>(`/api/events/${eventId}/gala/tables/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ x, y }),
      }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được vị trí bàn"),
  });

  const blockMutation = useMutation({
    mutationFn: ({ id, blocked }: { id: number; blocked: boolean }) =>
      apiFetch<GalaSeat>(`/api/events/${eventId}/gala/seats/${id}/block`, {
        method: "POST",
        body: JSON.stringify({ blocked }),
      }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không khoá được ghế"),
  });

  const hasActive = !!state?.turns.find((t) => t.status === "active");
  const hasWaiting = !!state?.turns.find((t) => t.status === "waiting");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={configOpen} onOpenChange={setConfigOpen}>
          <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
            {state?.config ? "Sửa cấu hình" : "Tạo cấu hình Gala"}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cấu hình Gala Dinner</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="gala-name">Tên</Label>
                <Input id="gala-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="stage-label">Nhãn sân khấu</Label>
                <Input id="stage-label" value={stageLabel} onChange={(e) => setStageLabel(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="turn-duration">Thời gian mỗi lượt (giây)</Label>
                <Input
                  id="turn-duration"
                  type="number"
                  value={turnDuration}
                  onChange={(e) => setTurnDuration(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="hold-ttl">Thời gian giữ ghế (giây)</Label>
                <Input id="hold-ttl" type="number" value={holdTtl} onChange={(e) => setHoldTtl(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!name || saveConfigMutation.isPending} onClick={() => saveConfigMutation.mutate()}>
                Lưu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={tableOpen} onOpenChange={setTableOpen}>
          <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>Thêm bàn</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Thêm bàn</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="table-code">Mã bàn</Label>
                <Input id="table-code" value={tableCode} onChange={(e) => setTableCode(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="table-seats">Số ghế</Label>
                <Input
                  id="table-seats"
                  type="number"
                  value={tableSeatCount}
                  onChange={(e) => setTableSeatCount(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Hình bàn</Label>
                <Select value={tableShape} onValueChange={(v) => setTableShape((v as "round" | "rect") ?? "round")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round">Tròn</SelectItem>
                    <SelectItem value="rect">Chữ nhật</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Bàn mới được xếp vào sơ đồ. Kéo bàn trên preview để chỉnh vị trí.
              </p>
            </div>
            <DialogFooter>
              <Button disabled={!tableCode || createTableMutation.isPending} onClick={() => createTableMutation.mutate()}>
                Lưu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          size="sm"
          disabled={!state?.config || (state.turns.length > 0) || drawMutation.isPending}
          onClick={() => drawMutation.mutate()}
        >
          Bốc thăm thứ tự Team
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!hasWaiting || hasActive || startMutation.isPending}
          onClick={() => startMutation.mutate()}
        >
          Bắt đầu lượt
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!hasActive || skipMutation.isPending}
          onClick={() => skipMutation.mutate()}
        >
          Bỏ qua lượt
        </Button>
        <Button
          size="sm"
          variant={blockMode ? "default" : "outline"}
          onClick={() => setBlockMode((v) => !v)}
        >
          {blockMode ? "Đang khoá ghế" : "Khoá ghế"}
        </Button>
        <Link href={`/gala/${eventId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Mở sơ đồ CBNV
        </Link>
      </div>

      {state?.config && (
        <p className="text-sm text-muted-foreground">
          Trạng thái: <Badge variant="outline">{state.config.status}</Badge> — {state.tables.length} bàn,{" "}
          {state.seats.length} ghế
          {blockMode ? " — bấm ghế trống để khoá/mở" : " — kéo bàn để xếp sơ đồ"}
        </p>
      )}

      {state?.config && (
        <GalaSeatMap
          state={state}
          arrange={!blockMode}
          blockMode={blockMode}
          onTableMove={(id, x, y) => moveMutation.mutate({ id, x, y })}
          onSeatClick={(seat) => {
            if (!blockMode) return;
            if (seat.status === "available") blockMutation.mutate({ id: seat.id, blocked: true });
            else if (seat.status === "blocked") blockMutation.mutate({ id: seat.id, blocked: false });
          }}
        />
      )}
      <GalaLegend />

      {state && state.turns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thứ tự bốc thăm</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {state.turns.map((t) => (
              <Badge
                key={t.id}
                variant={t.status === "active" ? "default" : "outline"}
                className={t.status === "done" || t.status === "skipped" || t.status === "expired" ? "opacity-50" : undefined}
              >
                #{t.order_no} {t.team_name} ({t.seat_quota} ghế) — {t.status}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
