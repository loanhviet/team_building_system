"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AllocationKpiStrip,
  AllocationPresetSelect,
  AllocationReadiness,
} from "@/components/domain/allocation-workbench";
import { EntityCrudTable } from "@/components/domain/entity-crud-table";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { AllocationWeightsHint } from "@/components/domain/allocation-weights-hint";
import { EventDateTimeField } from "@/components/domain/event-date-time-field";
import { FormField, MoreFields } from "@/components/domain/form-field";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { ResourceCard } from "@/components/domain/resource-card";
import { Segmented } from "@/components/domain/segmented";
import { StatusChip } from "@/components/domain/status-chip";
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
import {
  addMinutesToDatetimeLocal,
  durationLabel,
  eventDateOptions,
  fromDatetimeLocal,
  toDatetimeLocal,
} from "@/lib/datetime";
import { formatTime, formatUtcDateTime } from "@/lib/format";
import { flagReasonLabel } from "@/lib/labels";
import type {
  AllocationEnqueued,
  AllocationPreflight,
  AllocationPreset,
  AllocationRun,
  Bus,
  BusAssignment,
  Event,
  Job,
  PickupPoint,
  Site,
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
  const invalidateDashboard = () =>
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "dashboard"] });
  const [legId, setLegId] = useState<number | null>(null);
  const [preset, setPreset] = useState<AllocationPreset>("event_settings");
  const [focusBusId, setFocusBusId] = useState<number | "all">("all");
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
  const [filterTab, setFilterTab] = useState<"all" | "flag" | "locked" | "unassigned">("all");
  const [listSearch, setListSearch] = useState("");

  const { data: legs } = useQuery({
    queryKey: ["events", eventId, "transport-legs"],
    queryFn: () => apiFetch<TransportLeg[]>(`/api/events/${eventId}/transport-legs`),
  });
  const { data: event } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => apiFetch<Event>(`/api/events/${eventId}`),
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
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: () => apiFetch<Site[]>("/api/sites"),
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
  const { data: preflight } = useQuery({
    queryKey: ["events", eventId, "bus-preflight", currentLegId, buses?.length],
    queryFn: () =>
      apiFetch<AllocationPreflight>(
        `/api/events/${eventId}/allocations/bus/preflight?leg_id=${currentLegId}`,
      ),
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
      invalidateDashboard();
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
  const busDateOptions = eventDateOptions(event?.start_date, event?.end_date);
  const gatherLead = durationLabel(busForm.gather_at, busForm.depart_at);
  const setGatherLead = (minutes: number) => {
    if (!busForm.depart_at) {
      toast.error("Hãy chọn giờ khởi hành trước khi đặt giờ tập trung");
      return;
    }
    setBusForm((current) => ({
      ...current,
      gather_at: addMinutesToDatetimeLocal(current.depart_at, -minutes),
    }));
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
      invalidateDashboard();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const runAllocationMutation = useMutation({
    mutationFn: () =>
      apiFetch<AllocationEnqueued>(`/api/events/${eventId}/allocations/bus`, {
        method: "POST",
        body: JSON.stringify({ leg_id: currentLegId, ...(preset === "event_settings" ? {} : { preset }) }),
      }),
    onSuccess: (data) => {
      toast.info("Đang chạy phân xe...");
      setActiveJobId(data.job_id);
      setFilterTab("flag");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ busId }: { busId: number }) =>
      apiFetch(`/api/events/${eventId}/bus-assignments/adjust`, {
        method: "POST",
        body: JSON.stringify({
          employee_ids: Array.from(selected),
          team_id: moveTeamId ? Number(moveTeamId) : null,
          bus_id: busId,
          reason: adjustReason,
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
      invalidateDashboard();
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.code === "over_capacity" || err.code === "bus_incompatible")) {
        setOverCapacityMsg(err.message);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    },
  });

  const unlockMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ unlocked: number }>(`/api/events/${eventId}/bus-assignments/unlock`, {
        method: "POST",
        body: JSON.stringify({ leg_id: currentLegId, employee_ids: Array.from(selected) }),
      }),
    onSuccess: (data) => {
      toast.success(`Đã bỏ ghim ${data.unlocked} người — lần chạy phân xe tự động tiếp theo sẽ xét lại họ`);
      setSelected(new Set());
      refetchAssignments();
      invalidateDashboard();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
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

  const flagCount = (assignments ?? []).filter((a) => a.is_flagged).length;
  const lockedCount = (assignments ?? []).filter((a) => a.is_locked).length;
  const unassignedCount = (assignments ?? []).filter((a) => a.bus_id == null).length;
  const canReceiveSelection = (bus: Bus) => {
    const remaining = bus.capacity - (assignments ?? []).filter((a) => a.bus_id === bus.id).length;
    if (selected.size > remaining) return false;
    const pickupName = pickupPoints?.find((point) => point.id === bus.pickup_point_id)?.name;
    return (assignments ?? [])
      .filter((assignment) => selected.has(assignment.employee_id))
      .every(
        (assignment) =>
          !assignment.requested_pickup_point_name ||
          assignment.requested_pickup_point_name === pickupName,
      );
  };

  const visibleAssignments = (assignments ?? []).filter((a) => {
    if (focusBusId !== "all" && a.bus_id !== focusBusId) return false;
    if (filterTab === "flag" && !a.is_flagged) return false;
    if (filterTab === "locked" && !a.is_locked) return false;
    if (filterTab === "unassigned" && a.bus_id != null) return false;
    const q = listSearch.trim().toLowerCase();
    if (q) {
      const haystack = [a.full_name, a.employee_code, a.team_name].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  const allVisibleSelected =
    visibleAssignments.length > 0 && visibleAssignments.every((a) => selected.has(a.employee_id));

  const openAdjustmentFor = (employeeId: number) => {
    setSelected(new Set([employeeId]));
    setMoveTeamId("");
    setMoveTarget("");
    setOverCapacityMsg(null);
    setAdjustOpen(true);
  };

  const assignmentColumns: DataTableColumn<BusAssignment>[] = [
    {
      key: "person",
      header: "Nhân sự",
      cell: (a) => (
        <div className="flex items-center gap-2.5">
          <Checkbox
            checked={selected.has(a.employee_id)}
            onCheckedChange={(v) =>
              setSelected((prev) => {
                const copy = new Set(prev);
                if (v === true) copy.add(a.employee_id);
                else copy.delete(a.employee_id);
                return copy;
              })
            }
            aria-label={`Chọn ${a.full_name}`}
          />
          <InitialsAvatar name={a.full_name} className="size-8" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{a.full_name}</span>
            <span className="block truncate text-xs text-muted-foreground">{a.employee_code ?? "—"}</span>
          </span>
        </div>
      ),
      sortValue: (a) => a.full_name,
    },
    {
      key: "team",
      header: "Team / Khối",
      cell: (a) => a.team_name ?? "—",
      sortValue: (a) => a.team_name ?? "",
    },
    {
      key: "requested_pickup",
      header: "Điểm đón đăng ký",
      cell: (a) => a.requested_pickup_point_name ?? "—",
      sortValue: (a) => a.requested_pickup_point_name ?? "",
    },
    {
      key: "flight",
      header: "Chuyến bay",
      cell: (a) => a.flight_code ?? "—",
      sortValue: (a) => a.flight_code ?? "",
    },
    {
      key: "assigned",
      header: "Xe đã xếp",
      cell: (a) => {
        const assignedBus = buses?.find((b) => b.id === a.bus_id);
        const pickup = pickupPoints?.find((p) => p.id === assignedBus?.pickup_point_id);
        return assignedBus ? (
          <Badge variant="outline" className="font-mono">
            {assignedBus.code}
            {pickup ? ` · ${pickup.name}` : ""}
          </Badge>
        ) : (
          <span className="text-muted-foreground">Chưa xếp xe</span>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      cell: (a) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {a.is_flagged ? (
            <StatusChip kind="flag" label={flagReasonLabel(a.flag_reason)} />
          ) : a.bus_id != null ? (
            <StatusChip kind="confirmed" label="Đã xếp" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {a.is_locked && <Badge variant="secondary">Đã ghim</Badge>}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-28 text-right",
      cell: (a) => (
        <Button
          size="sm"
          variant={a.is_flagged ? "outline" : "ghost"}
          onClick={() => openAdjustmentFor(a.employee_id)}
          aria-label={`Chuyển ${a.full_name} sang xe khác ngay`}
        >
          <ArrowLeftRight className="size-4" aria-hidden="true" />
          <span className="ml-1.5">Chuyển</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <details className="rounded-2xl border border-border bg-card p-4">
        <summary className="cursor-pointer font-display text-base font-semibold">
          Chặng xe và điểm đón/trả
          <span className="ml-2 text-xs font-normal text-muted-foreground">({legs?.length ?? 0} chặng)</span>
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">Đây là dữ liệu CBNV dùng khi đăng ký và là cơ sở để tạo, phân bổ xe.</p>
        <div className="mt-3 grid gap-6 xl:grid-cols-2">
          <EntityCrudTable
            queryKey={["events", String(eventId), "transport-legs"]}
            label="chặng xe"
            basePath={`/api/events/${eventId}/transport-legs`}
            fields={[
              { name: "code", label: "Mã" },
              { name: "name", label: "Tên" },
              { name: "direction", label: "Chiều", options: [{ value: "outbound", label: "Chiều đi" }, { value: "inbound", label: "Chiều về" }, { value: "local", label: "Di chuyển nội bộ" }] },
              { name: "flight_timing", label: "Ràng buộc giờ bay", required: false, options: [{ value: "before_flight", label: "Trước chuyến bay" }, { value: "after_flight", label: "Sau chuyến bay" }, { value: "none", label: "Không liên quan" }] },
            ]}
          />
          <EntityCrudTable
            queryKey={["events", String(eventId), "pickup-points"]}
            label="điểm đón/trả"
            basePath={`/api/events/${eventId}/pickup-points`}
            fields={[
              { name: "name", label: "Tên điểm" },
              { name: "kind", label: "Loại", options: [{ value: "workplace", label: "Nơi làm việc" }, { value: "venue", label: "Điểm sự kiện" }] },
              { name: "site_id", label: "Địa điểm làm việc", required: false, options: (sites ?? []).map((site) => ({ value: String(site.id), label: `${site.code} · ${site.name}` })) },
              { name: "address", label: "Địa chỉ", required: false },
            ]}
          />
        </div>
      </details>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Phân xe</h2>
          <p className="text-sm text-muted-foreground">Chọn chặng, chỉ định trưởng xe, rồi chạy phân bổ.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Điểm đón, giờ bay và sức chứa luôn là ràng buộc cứng.
          </p>
        </div>
        <Select
          value={currentLegId ? String(currentLegId) : undefined}
          onValueChange={(v) => {
            setLegId(v ? Number(v) : null);
            setFocusBusId("all");
            setSelected(new Set());
          }}
        >
          <SelectTrigger className="min-h-11 w-64">
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

        <div className="flex flex-wrap items-center gap-2">
          <AllocationPresetSelect value={preset} onChange={setPreset} />
          <Dialog open={busDialogOpen} onOpenChange={setBusDialogOpen}>
            <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })} onClick={openCreateBus}>
              Thêm xe
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingBus ? "Sửa xe" : "Thêm xe cho chặng này"}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Mã xe" required>
                    <Input value={busForm.code} onChange={(e) => setBusForm({ ...busForm, code: e.target.value })} />
                  </FormField>
                  <FormField label="Sức chứa" required>
                    <Input
                      type="number"
                      value={busForm.capacity}
                      onChange={(e) => setBusForm({ ...busForm, capacity: e.target.value })}
                    />
                  </FormField>
                </div>
                <FormField label="Trưởng xe">
                  <Input
                    value={busForm.leader_name}
                    onChange={(e) => setBusForm({ ...busForm, leader_name: e.target.value })}
                    placeholder="Họ tên"
                  />
                </FormField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Giờ tập trung" hint={gatherLead ? `Trước giờ khởi hành ${gatherLead}.` : "Có thể chọn nhanh theo khoảng đệm."}>
                    <EventDateTimeField
                      ariaLabel="Giờ tập trung"
                      value={busForm.gather_at}
                      onChange={(gatherAt) => setBusForm({ ...busForm, gather_at: gatherAt })}
                      dateOptions={busDateOptions}
                      defaultDate={event?.start_date ?? undefined}
                    />
                  </FormField>
                  <FormField label="Giờ khởi hành" hint="Điểm đón và giờ bay sẽ được kiểm tra khi phân xe.">
                    <EventDateTimeField
                      ariaLabel="Giờ khởi hành"
                      value={busForm.depart_at}
                      onChange={(departAt) => setBusForm({ ...busForm, depart_at: departAt })}
                      dateOptions={busDateOptions}
                      defaultDate={event?.start_date ?? undefined}
                    />
                  </FormField>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-muted/30 p-2 text-xs">
                  <span className="mr-1 text-muted-foreground">Đặt tập trung trước:</span>
                  {[15, 30, 45, 60].map((minutes) => (
                    <Button key={minutes} type="button" size="sm" variant="outline" onClick={() => setGatherLead(minutes)}>
                      {minutes} phút
                    </Button>
                  ))}
                </div>
                <MoreFields>
                  <FormField label="SĐT trưởng xe">
                    <Input
                      value={busForm.leader_phone}
                      onChange={(e) => setBusForm({ ...busForm, leader_phone: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Tên xe">
                    <Input value={busForm.name} onChange={(e) => setBusForm({ ...busForm, name: e.target.value })} />
                  </FormField>
                  <FormField label="Điểm đón">
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
                  </FormField>
                  <FormField label="Điểm đến">
                    <Input
                      value={busForm.destination}
                      onChange={(e) => setBusForm({ ...busForm, destination: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Ghi chú" className="sm:col-span-2">
                    <Input value={busForm.note} onChange={(e) => setBusForm({ ...busForm, note: e.target.value })} />
                  </FormField>
                </MoreFields>
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
            disabled={!currentLegId || !preflight?.ready || runAllocationMutation.isPending || job?.status === "running"}
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
                          <span>{formatUtcDateTime(run.created_at)}</span>
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
        <div className="w-full"><AllocationWeightsHint eventId={eventId} kind="bus" /></div>
      </div>
      </div>

      <AllocationReadiness data={preflight} />

      <AllocationKpiStrip
        items={[
          { label: "Cần xe", value: preflight?.eligible ?? "—" },
          { label: "Đã phân", value: (assignments ?? []).filter((a) => a.bus_id).length },
          { label: "Chưa phân", value: unassignedCount, tone: "danger" },
          { label: "Cần xử lý", value: flagCount, tone: flagCount ? "warning" : "default" },
          { label: "Tổng chỗ", value: preflight?.capacity ?? "—" },
        ]}
      />

      <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 xl:grid-cols-4">
        <ResourceCard
          title="Tất cả"
          subtitle={`${(assignments ?? []).length} người`}
          selected={focusBusId === "all"}
          onClick={() => setFocusBusId("all")}
        />
        {(buses ?? []).map((b) => {
          const n = (assignments ?? []).filter((a) => a.bus_id === b.id).length;
          return (
            <ResourceCard
              key={b.id}
              title={b.code}
              subtitle={[
                b.depart_at ? formatTime(b.depart_at) : null,
                b.leader_name ? `TX ${b.leader_name}` : "Chưa có trưởng xe",
                pickupPoints?.find((p) => p.id === b.pickup_point_id)?.name,
              ]
                .filter(Boolean)
                .join(" · ")}
              assigned={n}
              capacity={b.capacity}
              selected={focusBusId === b.id}
              onClick={() => setFocusBusId(b.id)}
              warning={!b.leader_name ? "Thiếu trưởng xe" : undefined}
              footer={
                <Button
                  variant="ghost"
                  className="mt-1 h-8 px-0 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditBus(b);
                  }}
                >
                  Sửa xe
                </Button>
              }
            />
          );
        })}
      </div>

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

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Tìm tên, mã NV, team..."
            className="w-64"
          />
          <Segmented
            ariaLabel="Lọc danh sách nhu cầu xe"
            value={filterTab}
            onChange={setFilterTab}
            options={[
              { value: "all", label: `Tất cả (${(assignments ?? []).length})` },
              { value: "flag", label: `Chỉ Flag (${flagCount})` },
              { value: "locked", label: `Đã ghim (${lockedCount})` },
              { value: "unassigned", label: `Chưa xếp (${unassignedCount})` },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() =>
              setSelected(
                allVisibleSelected ? new Set() : new Set(visibleAssignments.map((a) => a.employee_id)),
              )
            }
          >
            {allVisibleSelected ? "Bỏ chọn tất cả" : `Chọn tất cả (${visibleAssignments.length})`}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
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
                <SelectItem key={b.id} value={String(b.id)} disabled={selected.size > 0 && !canReceiveSelection(b)}>
                  {b.code} · còn {b.capacity - (assignments ?? []).filter((a) => a.bus_id === b.id).length}
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

        {selected.size > 0 && (
          <div className="sticky top-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-card p-3 shadow-[var(--shadow-card)]">
            <span className="text-sm font-medium">{selected.size} đã chọn</span>
            <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v ?? "")}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Chuyển tới xe" />
              </SelectTrigger>
              <SelectContent>
                {buses?.map((bus) => (
                  <SelectItem key={bus.id} value={String(bus.id)} disabled={!canReceiveSelection(bus)}>
                    {bus.code} · còn {bus.capacity - (assignments ?? []).filter((a) => a.bus_id === bus.id).length}
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
              Điều chỉnh
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={unlockMutation.isPending}
              onClick={() => unlockMutation.mutate()}
            >
              Bỏ ghim
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
          </div>
        )}

        <DataTable
          columns={assignmentColumns}
          rows={visibleAssignments}
          rowKey={(a) => a.employee_id}
          emptyMessage="Chưa có nhu cầu xe cho chặng này — chạy phân bổ hoặc chọn “Tất cả”."
          pageSize={50}
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
              <Label>Chuyển tới xe</Label>
              <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn xe thay thế" />
                </SelectTrigger>
                <SelectContent>
                  {buses?.map((bus) => (
                    <SelectItem key={bus.id} value={String(bus.id)} disabled={!canReceiveSelection(bus)}>
                      {bus.code} · còn {bus.capacity - (assignments ?? []).filter((a) => a.bus_id === bus.id).length} chỗ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Lý do</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
            </div>
            {overCapacityMsg && <p className="text-sm text-red-600">{overCapacityMsg}</p>}
          </div>
          <DialogFooter>
            {!overCapacityMsg ? (
              <Button
                disabled={!moveTarget || !adjustReason.trim() || adjustMutation.isPending}
                onClick={() => moveTarget && adjustMutation.mutate({ busId: Number(moveTarget) })}
              >
                Xác nhận
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setAdjustOpen(false)}>
                Đóng để sửa dữ liệu
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
