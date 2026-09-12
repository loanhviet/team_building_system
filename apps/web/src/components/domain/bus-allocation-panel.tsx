"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { apiDownload, apiFetch, ApiError } from "@/lib/api";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime";
import { assignmentSourceLabel, flagReasonLabel } from "@/lib/labels";
import type {
  AllocationEnqueued,
  AllocationRun,
  Bus,
  BusAssignment,
  Job,
  PickupPoint,
  Team,
  TransportLeg,
} from "@/types/api";

const DEFAULT_ADJUST_REASON = "Điều chỉnh thủ công từ Admin";

const EMPTY_BUS = {
  code: "",
  name: "",
  capacity: "16",
  gather_at: "",
  depart_at: "",
  pickup_point_id: "",
  destination: "",
  leader_name: "",
  leader_phone: "",
  note: "",
};

export function BusAllocationPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const [legId, setLegId] = useState<number | null>(null);
  const [busDialogOpen, setBusDialogOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [busForm, setBusForm] = useState(EMPTY_BUS);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [moveTarget, setMoveTarget] = useState("");
  const [moveTeamId, setMoveTeamId] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustReason, setAdjustReason] = useState(DEFAULT_ADJUST_REASON);
  const [overCapacityMsg, setOverCapacityMsg] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: legs } = useQuery({
    queryKey: ["events", eventId, "transport-legs"],
    queryFn: () => apiFetch<TransportLeg[]>(`/api/events/${eventId}/transport-legs`),
  });

  const currentLegId = legId ?? legs?.[0]?.id ?? null;

  const { data: buses } = useQuery({
    queryKey: ["events", eventId, "buses", currentLegId],
    queryFn: () => apiFetch<Bus[]>(`/api/events/${eventId}/buses?leg_id=${currentLegId}`),
    enabled: !!currentLegId,
  });

  const { data: pickupPoints } = useQuery({
    queryKey: ["events", eventId, "pickup-points"],
    queryFn: () => apiFetch<PickupPoint[]>(`/api/events/${eventId}/pickup-points`),
  });

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => apiFetch<Team[]>("/api/teams"),
  });

  const { data: history } = useQuery({
    queryKey: ["events", eventId, "allocations", "bus"],
    queryFn: () => apiFetch<AllocationRun[]>(`/api/events/${eventId}/allocations/bus/history`),
  });

  const { data: assignments, refetch: refetchAssignments } = useQuery({
    queryKey: ["events", eventId, "bus-assignments", currentLegId],
    queryFn: () =>
      apiFetch<BusAssignment[]>(`/api/events/${eventId}/bus-assignments?leg_id=${currentLegId}`),
    enabled: !!currentLegId,
  });

  const { data: job } = useQuery({
    queryKey: ["jobs", activeJobId],
    queryFn: () => apiFetch<Job>(`/api/jobs/${activeJobId}`),
    enabled: activeJobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "succeeded" || status === "failed" ? false : 1200;
    },
  });

  useEffect(() => {
    if (job && (job.status === "succeeded" || job.status === "failed")) {
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "bus-assignments"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.id]);

  const openCreateBus = () => {
    setEditingBus(null);
    setBusForm(EMPTY_BUS);
    setBusDialogOpen(true);
  };
  const openEditBus = (bus: Bus) => {
    setEditingBus(bus);
    setBusForm({
      code: bus.code,
      name: bus.name ?? "",
      capacity: String(bus.capacity),
      gather_at: toDatetimeLocal(bus.gather_at),
      depart_at: toDatetimeLocal(bus.depart_at),
      pickup_point_id: bus.pickup_point_id ? String(bus.pickup_point_id) : "",
      destination: bus.destination ?? "",
      leader_name: bus.leader_name ?? "",
      leader_phone: bus.leader_phone ?? "",
      note: bus.note ?? "",
    });
    setBusDialogOpen(true);
  };

  const saveBusMutation = useMutation({
    mutationFn: () => {
      const payload = {
        code: busForm.code,
        name: busForm.name || null,
        capacity: Number(busForm.capacity),
        gather_at: fromDatetimeLocal(busForm.gather_at),
        depart_at: fromDatetimeLocal(busForm.depart_at),
        pickup_point_id: busForm.pickup_point_id ? Number(busForm.pickup_point_id) : null,
        destination: busForm.destination || null,
        leader_name: busForm.leader_name || null,
        leader_phone: busForm.leader_phone || null,
        note: busForm.note || null,
      };
      if (editingBus) {
        return apiFetch<Bus>(`/api/events/${eventId}/buses/${editingBus.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<Bus>(`/api/events/${eventId}/buses`, {
        method: "POST",
        body: JSON.stringify({ ...payload, leg_id: currentLegId }),
      });
    },
    onSuccess: () => {
      toast.success(editingBus ? "Đã cập nhật xe" : "Đã thêm xe");
      setBusDialogOpen(false);
      setEditingBus(null);
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "buses", currentLegId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const runAllocationMutation = useMutation({
    mutationFn: () =>
      apiFetch<AllocationEnqueued>(`/api/events/${eventId}/allocations/bus`, {
        method: "POST",
        body: JSON.stringify({ leg_id: currentLegId }),
      }),
    onSuccess: (data) => {
      toast.info("Đang chạy phân xe...");
      setActiveJobId(data.job_id);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ busId, force }: { busId: number; force: boolean }) =>
      apiFetch(`/api/events/${eventId}/bus-assignments/adjust`, {
        method: "POST",
        body: JSON.stringify({
          employee_ids: Array.from(selected),
          team_id: moveTeamId ? Number(moveTeamId) : null,
          bus_id: busId,
          reason: adjustReason,
          force,
        }),
      }),
    onSuccess: () => {
      toast.success("Đã chuyển xe");
      setSelected(new Set());
      setMoveTarget("");
      setMoveTeamId("");
      setAdjustOpen(false);
      setOverCapacityMsg(null);
      refetchAssignments();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "over_capacity") {
        setOverCapacityMsg(err.message);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    },
  });

  type BusAllocationSummary = {
    total_needed: number;
    total_assigned: number;
    total_flagged: number;
    buses: { bus_id: number; capacity: number; assigned: number; remaining: number }[];
  };

  // Same fallback as the flights panel: without this, the summary card (and
  // any per-bus remaining count) only ever appeared right after running an
  // allocation in this exact tab, not on a normal page load.
  const latestRunForLeg = history?.find(
    (run) => run.status === "succeeded" && (run.params_json as { leg_id?: number } | null)?.leg_id === currentLegId,
  );
  const summary = (job?.result_json ?? latestRunForLeg?.summary_json) as BusAllocationSummary | undefined;

  const teamName = (id: number) => teams?.find((t) => t.id === id)?.name ?? `#${id}`;

  const busColumns: DataTableColumn<Bus>[] = [
    { key: "code", header: "Mã xe", cell: (b) => b.code, className: "font-mono", sortValue: (b) => b.code },
    { key: "name", header: "Tên xe", cell: (b) => b.name ?? "—", sortValue: (b) => b.name },
    { key: "capacity", header: "Sức chứa", cell: (b) => b.capacity, sortValue: (b) => b.capacity },
    {
      key: "gather_at",
      header: "Tập trung",
      cell: (b) => (b.gather_at ? new Date(b.gather_at).toLocaleString("vi-VN") : "—"),
      sortValue: (b) => b.gather_at,
    },
    {
      key: "pickup",
      header: "Điểm đón",
      cell: (b) => pickupPoints?.find((p) => p.id === b.pickup_point_id)?.name ?? "—",
    },
    { key: "destination", header: "Điểm đến", cell: (b) => b.destination ?? "—" },
    { key: "leader_name", header: "Trưởng xe", cell: (b) => b.leader_name ?? "—", sortValue: (b) => b.leader_name },
    { key: "leader_phone", header: "SĐT", cell: (b) => b.leader_phone ?? "—" },
    {
      key: "actions",
      header: "",
      cell: (b) => (
        <Button size="sm" variant="ghost" onClick={() => openEditBus(b)}>
          Sửa
        </Button>
      ),
    },
  ];

  const assignmentColumns: DataTableColumn<BusAssignment>[] = [
    {
      key: "select",
      header: "",
      className: "w-8",
      cell: (a) => (
        <Checkbox
          checked={selected.has(a.employee_id)}
          onCheckedChange={(checked) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (checked === true) next.add(a.employee_id);
              else next.delete(a.employee_id);
              return next;
            })
          }
        />
      ),
    },
    {
      key: "employee_code",
      header: "Mã NV",
      cell: (a) => a.employee_code ?? "—",
      className: "font-mono",
      sortValue: (a) => a.employee_code,
    },
    { key: "full_name", header: "Họ tên", cell: (a) => a.full_name, sortValue: (a) => a.full_name },
    { key: "team_name", header: "Team", cell: (a) => a.team_name ?? "—", sortValue: (a) => a.team_name },
    {
      key: "bus",
      header: "Xe",
      cell: (a) => (
        <>
          {buses?.find((b) => b.id === a.bus_id)?.code ?? "Chưa xếp"}
          {a.is_locked && (
            <Badge variant="secondary" className="ml-1">
              Ghim
            </Badge>
          )}
          {a.is_flagged && (
            <Badge variant="destructive" className="ml-1">
              {flagReasonLabel(a.flag_reason)}
            </Badge>
          )}
        </>
      ),
    },
    { key: "source", header: "Nguồn", cell: (a) => assignmentSourceLabel(a.source), sortValue: (a) => a.source },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Select
          value={currentLegId ? String(currentLegId) : undefined}
          onValueChange={(v) => setLegId(v ? Number(v) : null)}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Chọn chặng" />
          </SelectTrigger>
          <SelectContent>
            {legs?.map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Dialog open={busDialogOpen} onOpenChange={setBusDialogOpen}>
            <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })} onClick={openCreateBus}>
              Thêm xe
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingBus ? "Sửa xe" : "Thêm xe cho chặng này"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Mã xe</Label>
                  <Input value={busForm.code} onChange={(e) => setBusForm({ ...busForm, code: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Tên xe</Label>
                  <Input value={busForm.name} onChange={(e) => setBusForm({ ...busForm, name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Sức chứa</Label>
                  <Input
                    type="number"
                    value={busForm.capacity}
                    onChange={(e) => setBusForm({ ...busForm, capacity: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Điểm đón</Label>
                  <Select
                    value={busForm.pickup_point_id}
                    onValueChange={(v) => setBusForm({ ...busForm, pickup_point_id: v ?? "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn điểm đón" />
                    </SelectTrigger>
                    <SelectContent>
                      {pickupPoints?.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Giờ tập trung</Label>
                  <Input
                    type="datetime-local"
                    value={busForm.gather_at}
                    onChange={(e) => setBusForm({ ...busForm, gather_at: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Giờ khởi hành</Label>
                  <Input
                    type="datetime-local"
                    value={busForm.depart_at}
                    onChange={(e) => setBusForm({ ...busForm, depart_at: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Điểm đến</Label>
                  <Input
                    value={busForm.destination}
                    onChange={(e) => setBusForm({ ...busForm, destination: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Trưởng xe</Label>
                  <Input
                    value={busForm.leader_name}
                    onChange={(e) => setBusForm({ ...busForm, leader_name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>SĐT Trưởng xe</Label>
                  <Input
                    value={busForm.leader_phone}
                    onChange={(e) => setBusForm({ ...busForm, leader_phone: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>Ghi chú</Label>
                  <Input value={busForm.note} onChange={(e) => setBusForm({ ...busForm, note: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!busForm.code || saveBusMutation.isPending}
                  onClick={() => saveBusMutation.mutate()}
                >
                  Lưu
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            size="sm"
            disabled={!currentLegId || runAllocationMutation.isPending || job?.status === "running"}
            onClick={() => runAllocationMutation.mutate()}
          >
            Chạy phân xe tự động
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              apiDownload(
                `/api/events/${eventId}/bus-assignments/export?leg_id=${currentLegId}`,
                `bus_assignments_event_${eventId}_leg_${currentLegId}.xlsx`,
              ).catch((err) => toast.error(err instanceof ApiError ? err.message : "Tải file thất bại"))
            }
          >
            Export Excel
          </Button>
          <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
            <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
              Lịch sử phân xe
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Lịch sử chạy phân xe</DialogTitle>
              </DialogHeader>
              <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                {history?.length ? (
                  history.map((run) => {
                    const s = run.summary_json as
                      | { total_needed: number; total_assigned: number; total_flagged: number }
                      | null;
                    return (
                      <div key={run.id} className="rounded-md border p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span>{new Date(run.created_at).toLocaleString("vi-VN")}</span>
                          <Badge variant={run.status === "succeeded" ? "default" : run.status === "failed" ? "destructive" : "outline"}>
                            {run.status}
                          </Badge>
                        </div>
                        {s && (
                          <p className="mt-1 text-muted-foreground">
                            Đã xếp {s.total_assigned}/{s.total_needed}, flag {s.total_flagged}
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Chưa chạy lần nào</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DataTable
        columns={busColumns}
        rows={buses ?? []}
        rowKey={(b) => b.id}
        emptyMessage="Chưa có xe cho chặng này"
      />

      {job && (job.status === "queued" || job.status === "running") && (
        <p className="text-sm text-muted-foreground">Đang chạy phân xe...</p>
      )}

      {summary && (
        <div className="rounded-md border p-4 text-sm">
          <p>
            Đã xếp: <b>{summary.total_assigned}</b>/{summary.total_needed} — Cần xử lý:{" "}
            <b>{summary.total_flagged}</b>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {summary.buses.map((b) => {
              const bus = buses?.find((x) => x.id === b.bus_id);
              return (
                <Badge key={b.bus_id} variant="outline">
                  {bus?.code ?? b.bus_id}: {b.assigned}/{b.capacity}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Danh sách nhu cầu xe (chặng đã chọn)</p>
          {selected.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selected.size} đã chọn</span>
              <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v ?? "")}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Chuyển tới xe" />
                </SelectTrigger>
                <SelectContent>
                  {buses?.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!moveTarget}
                onClick={() => {
                  setMoveTeamId("");
                  setOverCapacityMsg(null);
                  setAdjustOpen(true);
                }}
              >
                Chuyển
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Hoặc chuyển cả Team:</span>
          <Select value={moveTeamId} onValueChange={(v) => setMoveTeamId(v ?? "")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Chọn Team" />
            </SelectTrigger>
            <SelectContent>
              {teams?.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v ?? "")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Chuyển tới xe" />
            </SelectTrigger>
            <SelectContent>
              {buses?.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!moveTarget || !moveTeamId}
            onClick={() => {
              setSelected(new Set());
              setOverCapacityMsg(null);
              setAdjustOpen(true);
            }}
          >
            Chuyển cả Team
          </Button>
        </div>
        <DataTable
          columns={assignmentColumns}
          rows={assignments ?? []}
          rowKey={(a) => a.employee_id}
          emptyMessage="Chưa có dữ liệu"
        />
      </div>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Điều chỉnh xe</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {moveTeamId
                ? `Chuyển cả team "${teamName(Number(moveTeamId))}" sang xe đã chọn.`
                : `Chuyển ${selected.size} người sang xe đã chọn.`}{" "}
              Cần ghi lý do (audit log).
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Lý do</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
              {overCapacityMsg && adjustReason.trim() === DEFAULT_ADJUST_REASON && (
                <p className="text-xs text-destructive">
                  Ghi đè sức chứa cần lý do cụ thể, không dùng lý do mặc định.
                </p>
              )}
            </div>
            {overCapacityMsg && <p className="text-sm text-red-600">{overCapacityMsg}</p>}
          </div>
          <DialogFooter>
            {!overCapacityMsg ? (
              <Button
                disabled={!adjustReason.trim() || adjustMutation.isPending}
                onClick={() => moveTarget && adjustMutation.mutate({ busId: Number(moveTarget), force: false })}
              >
                Xác nhận
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={
                  !adjustReason.trim() ||
                  adjustReason.trim() === DEFAULT_ADJUST_REASON ||
                  adjustMutation.isPending
                }
                onClick={() => moveTarget && adjustMutation.mutate({ busId: Number(moveTarget), force: true })}
              >
                Vẫn ghi đè sức chứa
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
