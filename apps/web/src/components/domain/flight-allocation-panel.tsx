"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { apiDownload, apiFetch, apiUpload, ApiError } from "@/lib/api";
import {
  addMinutesToDatetimeLocal,
  durationLabel,
  eventDateOptions,
  fromDatetimeLocal,
  toDatetimeLocal,
} from "@/lib/datetime";
import { formatTime, formatUtcDateTime } from "@/lib/format";
import { directionLabel, flagReasonLabel } from "@/lib/labels";
import type {
  AllocationEnqueued,
  AllocationPreflight,
  AllocationPreset,
  AllocationRun,
  Event,
  Flight,
  FlightAssignment,
  Job,
  Shift,
  Site,
  Team,
} from "@/types/api";

const DEFAULT_ADJUST_REASON = "Điều chỉnh thủ công từ Admin";

const EMPTY_FLIGHT = {
  flight_code: "",
  airline: "",
  direction: "outbound",
  shift_id: "",
  site_id: "",
  capacity: "0",
  origin: "",
  destination: "",
  depart_at: "",
  arrive_at: "",
};

export function FlightAllocationPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const invalidateDashboard = () =>
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "dashboard"] });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [preset, setPreset] = useState<AllocationPreset>("event_settings");
  const [focusFlightId, setFocusFlightId] = useState<number | "all">("all");
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [moveTarget, setMoveTarget] = useState("");
  const [moveTeamId, setMoveTeamId] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "flag" | "split" | "locked">("all");
  const [listSearch, setListSearch] = useState("");
  const [flightOpen, setFlightOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState<Flight | null>(null);
  const [flightForm, setFlightForm] = useState(EMPTY_FLIGHT);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustReason, setAdjustReason] = useState(DEFAULT_ADJUST_REASON);
  const [overCapacityMsg, setOverCapacityMsg] = useState<string | null>(null);
  const [softWarning, setSoftWarning] = useState(false);
  const [importErrors, setImportErrors] = useState<{ row: number; error: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: flights } = useQuery({
    queryKey: ["events", eventId, "flights"],
    queryFn: () => apiFetch<Flight[]>(`/api/events/${eventId}/flights`),
  });
  const { data: event } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => apiFetch<Event>(`/api/events/${eventId}`),
  });
  const { data: shifts } = useQuery({
    queryKey: ["events", eventId, "shifts"],
    queryFn: () => apiFetch<Shift[]>(`/api/events/${eventId}/shifts`),
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
    queryKey: ["events", eventId, "allocations", "flight"],
    queryFn: () => apiFetch<AllocationRun[]>(`/api/events/${eventId}/allocations?type_filter=flight`),
  });
  const { data: assignments, isLoading: assignmentsLoading, refetch: refetchAssignments } = useQuery({
    queryKey: ["events", eventId, "flight-assignments", direction],
    queryFn: () =>
      apiFetch<FlightAssignment[]>(`/api/events/${eventId}/flight-assignments?direction=${direction}`),
  });
  const { data: preflight } = useQuery({
    queryKey: ["events", eventId, "flight-preflight", direction, flights?.length],
    queryFn: () =>
      apiFetch<AllocationPreflight>(
        `/api/events/${eventId}/allocations/flight/preflight?direction=${direction}`,
      ),
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

  const importMutation = useMutation({
    mutationFn: (file: File) =>
      apiUpload<{ ok_rows: number; error_rows: number; errors: { row: number; error: string }[] }>(
        `/api/events/${eventId}/flights/import`,
        file,
      ),
    onSuccess: (result) => {
      toast.success(`Import xong: ${result.ok_rows} OK, ${result.error_rows} lỗi`);
      setImportErrors(result.errors ?? []);
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "flights"] });
      invalidateDashboard();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import thất bại"),
  });

  const runAllocationMutation = useMutation({
    mutationFn: () =>
      apiFetch<AllocationEnqueued>(`/api/events/${eventId}/allocations/flight`, {
        method: "POST",
        body: JSON.stringify({ direction, ...(preset === "event_settings" ? {} : { preset }) }),
      }),
    onSuccess: (data) => {
      toast.info("Đang chạy phân bổ...");
      setActiveJobId(data.job_id);
      setFilterTab("flag");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const saveFlight = useMutation({
    mutationFn: () => {
      const payload = {
        flight_code: flightForm.flight_code,
        airline: flightForm.airline || null,
        direction: flightForm.direction,
        shift_id: flightForm.shift_id ? Number(flightForm.shift_id) : null,
        site_id: flightForm.site_id ? Number(flightForm.site_id) : null,
        capacity: Number(flightForm.capacity),
        origin: flightForm.origin || null,
        destination: flightForm.destination || null,
        depart_at: fromDatetimeLocal(flightForm.depart_at),
        arrive_at: fromDatetimeLocal(flightForm.arrive_at),
      };
      if (editingFlight) {
        return apiFetch<Flight>(`/api/events/${eventId}/flights/${editingFlight.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<Flight>(`/api/events/${eventId}/flights`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(editingFlight ? "Đã cập nhật chuyến bay" : "Đã thêm chuyến bay");
      setFlightOpen(false);
      setEditingFlight(null);
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "flights"] });
      invalidateDashboard();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ flightId, acceptSoftWarnings }: { flightId: number; acceptSoftWarnings: boolean }) =>
      apiFetch(`/api/events/${eventId}/flight-assignments/adjust`, {
        method: "POST",
        body: JSON.stringify({
          employee_ids: Array.from(selected),
          team_id: moveTeamId ? Number(moveTeamId) : null,
          flight_id: flightId,
          reason: adjustReason,
          accept_soft_warnings: acceptSoftWarnings,
        }),
      }),
    onSuccess: () => {
      toast.success("Đã chuyển chuyến");
      setSelected(new Set());
      setMoveTarget("");
      setMoveTeamId("");
      setAdjustOpen(false);
      setOverCapacityMsg(null);
      setSoftWarning(false);
      refetchAssignments();
      invalidateDashboard();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "soft_warning_required") {
        setSoftWarning(true);
        setOverCapacityMsg(err.message);
        return;
      }
      if (err instanceof ApiError && (err.code === "over_capacity" || err.code === "site_mismatch")) {
        setSoftWarning(false);
        setOverCapacityMsg(err.message);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    },
  });

  const unlockMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ unlocked: number }>(`/api/events/${eventId}/flight-assignments/unlock`, {
        method: "POST",
        body: JSON.stringify({ direction, employee_ids: Array.from(selected) }),
      }),
    onSuccess: (data) => {
      toast.success(`Đã bỏ ghim ${data.unlocked} người — lần chạy phân bổ tự động tiếp theo sẽ xét lại họ`);
      setSelected(new Set());
      refetchAssignments();
      invalidateDashboard();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  useEffect(() => {
    if (job && (job.status === "succeeded" || job.status === "failed")) {
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "flight-assignments"] });
      invalidateDashboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.id]);

  type FlightAllocationSummary = {
    total_submitted: number;
    total_assigned: number;
    total_flagged: number;
    split_team_ids: number[];
    flights: { flight_id: number; capacity: number; assigned: number; remaining: number }[];
  };

  // A fresh run's job.result_json wins while it's live in this tab; otherwise
  // fall back to the latest persisted run for this direction, so "Còn trống"
  // still reflects reality on a normal page load, not just right after
  // someone clicks "Chạy phân bổ tự động" in the same session.
  const latestRunForDirection = history?.find(
    (run) => run.status === "succeeded" && (run.params_json as { direction?: string } | null)?.direction === direction,
  );
  const summary = (job?.result_json ?? latestRunForDirection?.summary_json) as
    | FlightAllocationSummary
    | undefined;
  const teamName = (id: number) => teams?.find((t) => t.id === id)?.name ?? `#${id}`;

  const openCreateFlight = () => {
    setEditingFlight(null);
    setFlightForm({ ...EMPTY_FLIGHT, direction });
    setFlightOpen(true);
  };
  const openEditFlight = (flight: Flight) => {
    setEditingFlight(flight);
    setFlightForm({
      flight_code: flight.flight_code,
      airline: flight.airline ?? "",
      direction: flight.direction,
      shift_id: flight.shift_id ? String(flight.shift_id) : "",
      site_id: flight.site_id ? String(flight.site_id) : "",
      capacity: String(flight.capacity),
      origin: flight.origin ?? "",
      destination: flight.destination ?? "",
      depart_at: toDatetimeLocal(flight.depart_at),
      arrive_at: toDatetimeLocal(flight.arrive_at),
    });
    setFlightOpen(true);
  };
  const updateFlightDeparture = (departAt: string) => {
    setFlightForm((current) => ({
      ...current,
      depart_at: departAt,
      arrive_at: current.arrive_at || addMinutesToDatetimeLocal(departAt, 90),
    }));
  };
  const flightDateOptions = eventDateOptions(event?.start_date, event?.end_date);
  const flightDuration = durationLabel(flightForm.depart_at, flightForm.arrive_at);

  const dirFlights = flights?.filter((f) => f.direction === direction) ?? [];
  const assignedCount = (flightId: number) =>
    (assignments ?? []).filter((a) => a.flight_id === flightId).length;
  const remainingCount = (f: Flight) => f.capacity - assignedCount(f.id);
  const canReceiveSelection = (flight: Flight) => {
    const alreadyOnTarget = (assignments ?? []).filter(
      (assignment) => selected.has(assignment.employee_id) && assignment.flight_id === flight.id,
    ).length;
    return (
      remainingCount(flight) >= selected.size - alreadyOnTarget &&
    (assignments ?? [])
      .filter((assignment) => selected.has(assignment.employee_id))
      .every(
        (assignment) =>
          flight.site_id == null ||
          assignment.employee_site_id == null ||
          assignment.employee_site_id === flight.site_id,
      )
    );
  };

  const splitTeamNames = new Set(
    (summary?.split_team_ids ?? [])
      .map((tid) => teams?.find((t) => t.id === tid)?.name)
      .filter((n): n is string => !!n),
  );
  // live, not from the last run's summary — how many distinct flights each
  // split team's members are actually on right now (manual moves after the
  // auto-run change this without a new run happening)
  const splitTeamFlightCounts = new Map(
    Array.from(splitTeamNames).map((name) => [
      name,
      new Set(
        (assignments ?? [])
          .filter((a) => a.team_name === name && a.flight_id != null)
          .map((a) => a.flight_id),
      ).size,
    ]),
  );
  const flagCount = (assignments ?? []).filter((a) => a.is_flagged).length;
  const lockedCount = (assignments ?? []).filter((a) => a.is_locked).length;

  const visibleAssignments = (assignments ?? []).filter((a) => {
    if (focusFlightId !== "all" && a.flight_id !== focusFlightId) return false;
    if (filterTab === "flag" && !a.is_flagged) return false;
    if (filterTab === "split" && !(a.team_name && splitTeamNames.has(a.team_name))) return false;
    if (filterTab === "locked" && !a.is_locked) return false;
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
    setSoftWarning(false);
    setAdjustOpen(true);
  };

  const assignmentColumns: DataTableColumn<FlightAssignment>[] = [
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
      key: "requested",
      header: "Nguyện vọng",
      cell: (a) => a.requested_shift_name ?? "—",
      sortValue: (a) => a.requested_shift_name ?? "",
    },
    {
      key: "assigned",
      header: "Chuyến xếp",
      cell: (a) => {
        const assignedFlight = flights?.find((f) => f.id === a.flight_id);
        const assignedShift = shifts?.find((s) => s.id === assignedFlight?.shift_id);
        return assignedFlight ? (
          <Badge variant="outline" className="font-mono">
            {assignedFlight.flight_code}
            {assignedShift ? ` · ${assignedShift.name}` : ""}
          </Badge>
        ) : (
          <span className="text-muted-foreground">Chưa xếp chuyến</span>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      cell: (a) => {
        const assignedFlight = flights?.find((f) => f.id === a.flight_id);
        const assignedShift = shifts?.find((s) => s.id === assignedFlight?.shift_id);
        const mismatch =
          !!a.requested_shift_name && !!assignedShift && a.requested_shift_name !== assignedShift.name;
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {mismatch ? (
              <StatusChip kind="flag" label="Lệch ca đăng ký" />
            ) : a.is_flagged ? (
              <StatusChip kind="flag" label={flagReasonLabel(a.flag_reason)} />
            ) : assignedFlight ? (
              <StatusChip kind="confirmed" label={assignedFlight.shift_id ? "Đúng ca" : "Đã xếp"} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {a.is_locked && <Badge variant="secondary">Đã ghim</Badge>}
          </div>
        );
      },
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
          aria-label={`Chuyển ${a.full_name} sang chuyến khác ngay`}
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
          Ca đăng ký chuyến bay
          <span className="ml-2 text-xs font-normal text-muted-foreground">({shifts?.length ?? 0} ca · CBNV chọn khi đăng ký)</span>
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">Tạo hoặc sửa ca ngay tại đây, sau đó gắn từng chuyến bay vào đúng ca.</p>
        <div className="mt-3">
          <EntityCrudTable
            queryKey={["events", String(eventId), "shifts"]}
            label="ca bay"
            basePath={`/api/events/${eventId}/shifts`}
            fields={[
              { name: "code", label: "Mã" },
              { name: "name", label: "Tên" },
              { name: "depart_after_time", label: "Sau giờ (HH:MM)", required: false },
            ]}
          />
        </div>
      </details>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Phân chuyến bay</h2>
          <p className="text-sm text-muted-foreground">Chọn chiều, xem slot, rồi chạy phân bổ hoặc kéo người sang chuyến khác.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sức chứa và địa điểm phục vụ luôn là ràng buộc cứng.
          </p>
        </div>
        <Segmented
          ariaLabel="Chiều bay"
          value={direction}
          onChange={(v) => {
            setDirection(v);
            setFocusFlightId("all");
            setSelected(new Set());
          }}
          options={[
            { value: "outbound", label: directionLabel("outbound") },
            { value: "inbound", label: directionLabel("inbound") },
          ]}
        />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-2">
          <span className="text-xs font-medium text-muted-foreground">Chiến lược</span>
          <AllocationPresetSelect value={preset} onChange={setPreset} />
          <div className="ml-auto"><AllocationReadiness data={preflight} /></div>
        </div>
        <AllocationWeightsHint eventId={eventId} kind="flight" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importMutation.mutate(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              apiDownload(
                `/api/events/${eventId}/flights/import-template`,
                `flights_template_event_${eventId}.xlsx`,
              ).catch((err) => toast.error(err instanceof ApiError ? err.message : "Tải file thất bại"))
            }
          >
            File mẫu
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Import chuyến bay
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              apiDownload(
                `/api/events/${eventId}/flight-assignments/export?direction=${direction}`,
                `flight_assignments_${direction}_event_${eventId}.xlsx`,
              ).catch((err) => toast.error(err instanceof ApiError ? err.message : "Tải file thất bại"))
            }
          >
            Export phân bổ
          </Button>
          <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
            <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
              Lịch sử phân bổ
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Lịch sử chạy phân bổ chuyến bay</DialogTitle>
              </DialogHeader>
              <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                {history?.length ? (
                  history.map((run) => {
                    const s = run.summary_json;
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
                            Đã xếp {s.total_assigned}/{s.total_submitted}, flag {s.total_flagged}, tách{" "}
                            {s.split_team_ids.length} team
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
          <Dialog open={flightOpen} onOpenChange={setFlightOpen}>
            <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })} onClick={openCreateFlight}>
              Thêm chuyến
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingFlight ? "Sửa chuyến bay" : "Thêm chuyến bay"}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Mã chuyến" required>
                    <Input value={flightForm.flight_code} onChange={(e) => setFlightForm({ ...flightForm, flight_code: e.target.value })} />
                  </FormField>
                  <FormField label="Sức chứa" required>
                    <Input type="number" value={flightForm.capacity} onChange={(e) => setFlightForm({ ...flightForm, capacity: e.target.value })} />
                  </FormField>
                </div>
                <FormField label="Khởi hành" hint="Chọn ngày chương trình rồi chọn giờ; hạ cánh tự gợi ý sau 90 phút.">
                  <EventDateTimeField
                    ariaLabel="Khởi hành"
                    value={flightForm.depart_at}
                    onChange={updateFlightDeparture}
                    dateOptions={flightDateOptions}
                    defaultDate={event?.start_date ?? undefined}
                  />
                </FormField>
                <FormField label="Hạ cánh" hint={flightDuration ? `Thời lượng dự kiến: ${flightDuration}` : "Nhập giờ hạ cánh để kiểm tra thời lượng."}>
                  <EventDateTimeField
                    ariaLabel="Hạ cánh"
                    value={flightForm.arrive_at}
                    onChange={(arriveAt) => setFlightForm({ ...flightForm, arrive_at: arriveAt })}
                    dateOptions={flightDateOptions}
                    defaultDate={event?.start_date ?? undefined}
                  />
                </FormField>
                <MoreFields>
                  <FormField label="Hãng">
                    <Input value={flightForm.airline} onChange={(e) => setFlightForm({ ...flightForm, airline: e.target.value })} />
                  </FormField>
                  <FormField label="Chiều">
                    <Select value={flightForm.direction} onValueChange={(v) => setFlightForm({ ...flightForm, direction: v ?? "outbound" })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outbound">{directionLabel("outbound")}</SelectItem>
                        <SelectItem value="inbound">{directionLabel("inbound")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Ca">
                    <Select value={flightForm.shift_id} onValueChange={(v) => setFlightForm({ ...flightForm, shift_id: v ?? "" })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn ca" />
                      </SelectTrigger>
                      <SelectContent>
                        {shifts?.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Địa điểm phục vụ" hint="Bỏ trống nếu chuyến này phục vụ mọi địa điểm">
                    <Select value={flightForm.site_id} onValueChange={(v) => setFlightForm({ ...flightForm, site_id: v ?? "" })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Mọi địa điểm" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites?.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Điểm đi">
                    <Input value={flightForm.origin} onChange={(e) => setFlightForm({ ...flightForm, origin: e.target.value })} />
                  </FormField>
                  <FormField label="Điểm đến">
                    <Input value={flightForm.destination} onChange={(e) => setFlightForm({ ...flightForm, destination: e.target.value })} />
                  </FormField>
                </MoreFields>
              </div>
              <DialogFooter>
                <Button disabled={!flightForm.flight_code || saveFlight.isPending} onClick={() => saveFlight.mutate()}>
                  Lưu
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            onClick={() => runAllocationMutation.mutate()}
            disabled={!preflight?.ready || runAllocationMutation.isPending || job?.status === "running"}
          >
            Chạy phân bổ tự động
          </Button>
        </div>
      </div>

      {importErrors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium text-destructive">{importErrors.length} dòng import lỗi</p>
            <Button variant="ghost" size="sm" onClick={() => setImportErrors([])}>
              Đóng
            </Button>
          </div>
          <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
            {importErrors.map((e) => (
              <li key={e.row}>
                Dòng {e.row}: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AllocationKpiStrip
        items={[
          { label: "Đủ điều kiện", value: preflight?.eligible ?? "—" },
          { label: "Đã phân", value: (assignments ?? []).filter((a) => a.flight_id).length },
          { label: "Chưa phân", value: (assignments ?? []).filter((a) => !a.flight_id).length, tone: "danger" },
          { label: "Cần xử lý", value: flagCount, tone: flagCount ? "warning" : "default" },
          { label: "Tổng chỗ", value: preflight?.capacity ?? "—" },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr] lg:items-start">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:flex-col lg:overflow-y-auto lg:pb-0 lg:pr-1">
          <ResourceCard
            title="Tất cả"
            subtitle={`${(assignments ?? []).length} người`}
            selected={focusFlightId === "all"}
            onClick={() => setFocusFlightId("all")}
          />
          {dirFlights.map((f) => {
            // always live from `assignments`, never the last run's summary —
            // that summary goes stale the moment someone manually reassigns
            // a person without re-running auto-allocation (U1)
            const n = assignedCount(f.id);
            return (
              <ResourceCard
                key={f.id}
                title={f.flight_code}
                subtitle={`${f.origin ?? "—"} → ${f.destination ?? "—"}${f.depart_at ? ` · ${formatTime(f.depart_at)}` : ""}${shifts?.find((s) => s.id === f.shift_id) ? ` · ${shifts.find((s) => s.id === f.shift_id)!.name}` : ""}${f.site_id ? ` · ${sites?.find((s) => s.id === f.site_id)?.name ?? ""}` : ""}`}
                assigned={n}
                capacity={f.capacity}
                selected={focusFlightId === f.id}
                onClick={() => setFocusFlightId(f.id)}
                footer={
                  <Button
                    variant="ghost"
                    className="mt-1 h-8 px-0 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditFlight(f);
                    }}
                  >
                    Sửa chuyến
                  </Button>
                }
              />
            );
          })}
        </div>

        <div className="flex flex-col gap-4">
          {job && (job.status === "queued" || job.status === "running") && (
            <p className="text-sm text-muted-foreground">Đang chạy phân bổ...</p>
          )}
          {summary && (
            <div className="rounded-md border p-4 text-sm">
              <p>
                Đã xếp: <b className="tabular">{summary.total_assigned}</b>/{summary.total_submitted}
              </p>
              {summary.total_flagged > 0 && (
                <p className="mt-2">
                  <StatusChip kind="flag" label={`${summary.total_flagged} ca cần xử lý`} />
                </p>
              )}
              {summary.split_team_ids.length > 0 && (
                <p className="mt-2">
                  <StatusChip
                    kind="flag"
                    label={`Team bị tách: ${summary.split_team_ids
                      .map((tid) => {
                        const name = teamName(tid);
                        const n = splitTeamFlightCounts.get(name);
                        return n ? `${name} · ${n} chuyến` : name;
                      })
                      .join(", ")}`}
                  />
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Tìm tên, mã NV, team..."
              className="w-64"
            />
            <Segmented
              ariaLabel="Lọc danh sách phân bổ"
              value={filterTab}
              onChange={setFilterTab}
              options={[
                { value: "all", label: `Tất cả (${(assignments ?? []).length})` },
                { value: "flag", label: `Chỉ Flag (${flagCount})` },
                { value: "split", label: `Team bị tách (${splitTeamNames.size})` },
                { value: "locked", label: `Đã ghim (${lockedCount})` },
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

          {filterTab === "flag" && flagCount > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Các dòng dưới đây cần BTC xử lý. Bấm <b>Chuyển</b> ngay tại từng dòng để chọn
              chuyến thay thế và ghi lý do; không cần cuộn xuống cuối trang.
            </div>
          )}

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
                <SelectValue placeholder="Chuyển tới chuyến" />
              </SelectTrigger>
              <SelectContent>
                {flights
                  ?.filter((f) => f.direction === direction)
                  .map((f) => (
                    <SelectItem key={f.id} value={String(f.id)} disabled={selected.size > 0 && !canReceiveSelection(f)}>
                      {f.flight_code} · còn {remainingCount(f)}
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
                setSoftWarning(false);
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
                  <SelectValue placeholder="Chuyển tới chuyến" />
                </SelectTrigger>
                <SelectContent>
                  {flights
                    ?.filter((f) => f.direction === direction)
                    .map((f) => (
                      <SelectItem key={f.id} value={String(f.id)} disabled={!canReceiveSelection(f)}>
                        {f.flight_code} · còn {remainingCount(f)}
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
                  setSoftWarning(false);
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
            isLoading={assignmentsLoading}
            emptyMessage="Chưa có người trên chuyến này — chạy phân bổ hoặc chọn “Tất cả”."
            pageSize={50}
          />
        </div>
      </div>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Điều chỉnh chuyến bay</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {moveTeamId
                ? `Chuyển cả team "${teamName(Number(moveTeamId))}" sang chuyến đã chọn.`
                : `Chuyển ${selected.size} người sang chuyến đã chọn.`}{" "}
              Cần ghi lý do (audit log).
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Chuyển tới chuyến</Label>
              <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chuyến thay thế" />
                </SelectTrigger>
                <SelectContent>
                  {dirFlights.map((flight) => (
                    <SelectItem key={flight.id} value={String(flight.id)} disabled={!canReceiveSelection(flight)}>
                      {flight.flight_code} · còn {remainingCount(flight)} chỗ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Chuyến không đủ chỗ hoặc sai địa điểm phục vụ sẽ không thể chọn.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Lý do</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
              {softWarning && adjustReason.trim() === DEFAULT_ADJUST_REASON && (
                <p className="text-xs text-destructive">
                  Ghi đè cảnh báo cần lý do cụ thể, không dùng lý do mặc định.
                </p>
              )}
            </div>
            {overCapacityMsg && <p className="text-sm text-red-600">{overCapacityMsg}</p>}
          </div>
          <DialogFooter>
            {!overCapacityMsg ? (
              <Button
                disabled={!moveTarget || !adjustReason.trim() || adjustMutation.isPending}
                onClick={() => moveTarget && adjustMutation.mutate({ flightId: Number(moveTarget), acceptSoftWarnings: false })}
              >
                Xác nhận
              </Button>
            ) : softWarning ? (
              <Button
                disabled={
                  !moveTarget ||
                  !adjustReason.trim() ||
                  adjustReason.trim() === DEFAULT_ADJUST_REASON ||
                  adjustMutation.isPending
                }
                onClick={() => moveTarget && adjustMutation.mutate({ flightId: Number(moveTarget), acceptSoftWarnings: true })}
              >
                Xác nhận lệch ca
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
