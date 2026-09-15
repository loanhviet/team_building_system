"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
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
import { galaConfigStatusLabel, galaTurnStatusLabel } from "@/lib/labels";
import { useCountdown } from "@/lib/use-countdown";
import { useGalaWebSocket } from "@/lib/use-gala-ws";
import type { GalaConfig, GalaSeat, GalaState, GalaTable, GalaTurn } from "@/types/api";

const DEFAULT_CONFIG_FORM = {
  name: "Gala Dinner",
  stageLabel: "Sân khấu",
  turnDuration: "60",
  holdTtl: "30",
  seatQuotaRule: "by_team_size" as "by_team_size" | "fixed",
  fixedQuota: "",
};

export function GalaAdminPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const queryKey = ["events", eventId, "gala", "state"];
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState(DEFAULT_CONFIG_FORM);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableCode, setTableCode] = useState("");
  const [tableSeatCount, setTableSeatCount] = useState("8");
  const [tableShape, setTableShape] = useState<"round" | "rect">("round");
  const [editingTable, setEditingTable] = useState<GalaTable | null>(null);
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

  const openConfigDialog = () => {
    if (state?.config) {
      setConfigForm({
        name: state.config.name,
        stageLabel: state.config.stage_label,
        turnDuration: String(state.config.turn_duration_seconds),
        holdTtl: String(state.config.hold_ttl_seconds),
        seatQuotaRule: state.config.seat_quota_rule,
        fixedQuota: state.config.fixed_quota != null ? String(state.config.fixed_quota) : "",
      });
    } else {
      setConfigForm(DEFAULT_CONFIG_FORM);
    }
    setConfigOpen(true);
  };

  const saveConfigMutation = useMutation({
    mutationFn: () =>
      apiFetch<GalaConfig>(`/api/events/${eventId}/gala/config`, {
        method: "PUT",
        body: JSON.stringify({
          name: configForm.name,
          stage_label: configForm.stageLabel,
          turn_duration_seconds: Number(configForm.turnDuration),
          hold_ttl_seconds: Number(configForm.holdTtl),
          seat_quota_rule: configForm.seatQuotaRule,
          fixed_quota: configForm.seatQuotaRule === "fixed" && configForm.fixedQuota
            ? Number(configForm.fixedQuota)
            : null,
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

  const updateTableMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: number; code: string; seat_count: number; shape: string }) =>
      apiFetch<GalaTable>(`/api/events/${eventId}/gala/tables/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Đã cập nhật bàn");
      setEditingTable(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const deleteTableMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch<GalaTable>(`/api/events/${eventId}/gala/tables/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      }),
    onSuccess: () => {
      toast.success("Đã xoá bàn");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Không xoá được bàn"),
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

  const activeTurn = state?.turns.find((t) => t.status === "active");
  const activeTurnRemaining = useCountdown(activeTurn?.expires_at ?? null);
  const hasWaiting = !!state?.turns.find((t) => t.status === "waiting");
  const hasAnyTurns = !!state && state.turns.length > 0;
  const activeTables = (state?.tables ?? []).filter((t) => t.is_active);
  const availableSeatCount = (state?.seats ?? []).filter((s) => s.status === "available").length;
  const confirmedCountByTeam = new Map<number, number>();
  for (const s of state?.seats ?? []) {
    if (s.status === "confirmed" && s.team_id != null) {
      confirmedCountByTeam.set(s.team_id, (confirmedCountByTeam.get(s.team_id) ?? 0) + 1);
    }
  }
  // only the original (non-makeup) turn's quota is the team's real total —
  // a makeup turn's quota is just the remainder that was still open when it
  // was spawned, so counting both would double-count (mirrors the same
  // reasoning in dashboard_service.build_dashboard's gala_unseated_count)
  const neededSeatCount = (state?.turns ?? [])
    .filter((t) => !t.is_makeup)
    .reduce((sum, t) => sum + Math.max(t.seat_quota - (confirmedCountByTeam.get(t.team_id) ?? 0), 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <Dialog open={configOpen} onOpenChange={(open) => (open ? openConfigDialog() : setConfigOpen(false))}>
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
                <Input
                  id="gala-name"
                  value={configForm.name}
                  onChange={(e) => setConfigForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="stage-label">Nhãn sân khấu</Label>
                <Input
                  id="stage-label"
                  value={configForm.stageLabel}
                  onChange={(e) => setConfigForm((f) => ({ ...f, stageLabel: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="turn-duration">Thời gian mỗi lượt (giây)</Label>
                <Input
                  id="turn-duration"
                  type="number"
                  value={configForm.turnDuration}
                  onChange={(e) => setConfigForm((f) => ({ ...f, turnDuration: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="hold-ttl">Thời gian giữ ghế (giây)</Label>
                <Input
                  id="hold-ttl"
                  type="number"
                  value={configForm.holdTtl}
                  onChange={(e) => setConfigForm((f) => ({ ...f, holdTtl: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Quy tắc hạn mức ghế</Label>
                <Select
                  value={configForm.seatQuotaRule}
                  onValueChange={(v) =>
                    setConfigForm((f) => ({ ...f, seatQuotaRule: (v as "by_team_size" | "fixed") ?? "by_team_size" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="by_team_size">Theo số người tham gia của Team</SelectItem>
                    <SelectItem value="fixed">Số cố định cho mọi Team</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {configForm.seatQuotaRule === "fixed" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fixed-quota">Số ghế cố định mỗi Team</Label>
                  <Input
                    id="fixed-quota"
                    type="number"
                    value={configForm.fixedQuota}
                    onChange={(e) => setConfigForm((f) => ({ ...f, fixedQuota: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                disabled={!configForm.name || saveConfigMutation.isPending}
                onClick={() => saveConfigMutation.mutate()}
              >
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

        {hasAnyTurns ? (
          <p className="text-xs text-muted-foreground">
            Đã bốc thăm — không thể bốc lại (thứ tự Team đã cố định)
          </p>
        ) : (
          <ConfirmDialog
            trigger={
              <Button size="sm" disabled={!state?.config || drawMutation.isPending}>
                Bốc thăm thứ tự Team
              </Button>
            }
            title="Bốc thăm thứ tự Team?"
            description="Thứ tự sẽ cố định ngay sau khi bốc — không thể bốc lại. Chỉ bốc khi đã chốt danh sách đăng ký."
            confirmLabel="Bốc thăm"
            onConfirm={() => drawMutation.mutate()}
          />
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!hasWaiting || !!activeTurn || startMutation.isPending}
          onClick={() => startMutation.mutate()}
        >
          Bắt đầu lượt
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline" disabled={!activeTurn || skipMutation.isPending}>
              Bỏ qua lượt
            </Button>
          }
          title="Bỏ qua lượt hiện tại?"
          description={
            activeTurn
              ? `Team "${activeTurn.team_name}" sẽ mất lượt này, mọi ghế đang giữ sẽ được nhả. Nếu chưa đủ hạn mức ghế, Team sẽ có 1 lượt bù ở cuối hàng chờ. Chuyển sang Team tiếp theo.`
              : undefined
          }
          confirmLabel="Bỏ qua"
          destructive
          onConfirm={() => skipMutation.mutate()}
        />
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
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Trạng thái: <Badge variant="outline">{galaConfigStatusLabel(state.config.status)}</Badge>
          </span>
          <span>
            {state.tables.length} bàn, {state.seats.length} ghế
          </span>
          <span>
            Ghế trống <b>{availableSeatCount}</b> · Cần <b>{neededSeatCount}</b>
          </span>
          {activeTurn && (
            <span>
              Đang chọn: <b>{activeTurn.team_name}</b>
              {activeTurnRemaining !== null && ` — còn ${activeTurnRemaining}s`}
            </span>
          )}
          <span>{blockMode ? "— bấm ghế trống để khoá/mở" : "— kéo bàn để xếp sơ đồ"}</span>
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

      {activeTables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Danh sách bàn</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {activeTables.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1.5 text-sm last:border-0">
                <span>
                  <b>{t.code}</b> — {t.seat_count} ghế, {t.shape === "round" ? "tròn" : "chữ nhật"}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    X
                    <Input
                      key={`x-${t.id}-${t.x}`}
                      type="number"
                      className="h-8 w-16"
                      defaultValue={t.x}
                      aria-label={`Toạ độ X bàn ${t.code}`}
                      onBlur={(e) => {
                        const x = Number(e.target.value);
                        if (!Number.isNaN(x) && x !== t.x) moveMutation.mutate({ id: t.id, x, y: t.y });
                      }}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Y
                    <Input
                      key={`y-${t.id}-${t.y}`}
                      type="number"
                      className="h-8 w-16"
                      defaultValue={t.y}
                      aria-label={`Toạ độ Y bàn ${t.code}`}
                      onBlur={(e) => {
                        const y = Number(e.target.value);
                        if (!Number.isNaN(y) && y !== t.y) moveMutation.mutate({ id: t.id, x: t.x, y });
                      }}
                    />
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => setEditingTable(t)}>
                    Sửa
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="ghost" className="text-destructive">
                        Xoá
                      </Button>
                    }
                    title={`Xoá bàn ${t.code}?`}
                    description="Bàn sẽ bị ẩn khỏi sơ đồ. Không xoá được nếu còn ghế đang giữ/đã xác nhận trong bàn."
                    confirmLabel="Xoá"
                    destructive
                    onConfirm={() => deleteTableMutation.mutate(t.id)}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {editingTable && (
        <EditTableDialog
          table={editingTable}
          onClose={() => setEditingTable(null)}
          onSave={(payload) => updateTableMutation.mutate({ id: editingTable.id, ...payload })}
          pending={updateTableMutation.isPending}
        />
      )}

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
                #{t.order_no} {t.team_name} ({confirmedCountByTeam.get(t.team_id) ?? 0}/{t.seat_quota} ghế) —{" "}
                {galaTurnStatusLabel(t.status)}
                {t.is_makeup && " · Lượt bù"}
                {!t.has_representative && " · Chưa có trưởng nhóm"}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EditTableDialog({
  table,
  onClose,
  onSave,
  pending,
}: {
  table: GalaTable;
  onClose: () => void;
  onSave: (payload: { code: string; seat_count: number; shape: string }) => void;
  pending: boolean;
}) {
  const [code, setCode] = useState(table.code);
  const [seatCount, setSeatCount] = useState(String(table.seat_count));
  const [shape, setShape] = useState<"round" | "rect">(table.shape);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa bàn {table.code}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-table-code">Mã bàn</Label>
            <Input id="edit-table-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-table-seats">Số ghế</Label>
            <Input
              id="edit-table-seats"
              type="number"
              value={seatCount}
              onChange={(e) => setSeatCount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Giảm số ghế sẽ thất bại nếu ghế bị cắt đang được giữ/xác nhận.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Hình bàn</Label>
            <Select value={shape} onValueChange={(v) => setShape((v as "round" | "rect") ?? "round")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="round">Tròn</SelectItem>
                <SelectItem value="rect">Chữ nhật</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!code || pending}
            onClick={() => onSave({ code, seat_count: Number(seatCount), shape })}
          >
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
