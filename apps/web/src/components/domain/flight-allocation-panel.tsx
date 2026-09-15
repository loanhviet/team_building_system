"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FormField, MoreFields } from "@/components/domain/form-field";
import { PersonRow } from "@/components/domain/person-row";
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
import { directionLabel, flagReasonLabel } from "@/lib/labels";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type {
  AllocationEnqueued,
  AllocationRun,
  Flight,
  FlightAssignment,
  Job,
  Shift,
  Team,
} from "@/types/api";

const DEFAULT_ADJUST_REASON = "Điều chỉnh thủ công từ Admin";

const EMPTY_FLIGHT = {
  flight_code: "",
  airline: "",
  direction: "outbound",
  shift_id: "",
  capacity: "0",
  origin: "",
  destination: "",
  depart_at: "",
  arrive_at: "",
};

export function FlightAllocationPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [focusFlightId, setFocusFlightId] = useState<number | "all">("all");
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [moveTarget, setMoveTarget] = useState("");
  const [moveTeamId, setMoveTeamId] = useState("");
  const [flagsOnly, setFlagsOnly] = useState(false);
  const [flightOpen, setFlightOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState<Flight | null>(null);
  const [flightForm, setFlightForm] = useState(EMPTY_FLIGHT);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustReason, setAdjustReason] = useState(DEFAULT_ADJUST_REASON);
  const [overCapacityMsg, setOverCapacityMsg] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<{ row: number; error: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: flights } = useQuery({
    queryKey: ["events", eventId, "flights"],
    queryFn: () => apiFetch<Flight[]>(`/api/events/${eventId}/flights`),
  });
  const { data: shifts } = useQuery({
    queryKey: ["events", eventId, "shifts"],
    queryFn: () => apiFetch<Shift[]>(`/api/events/${eventId}/shifts`),
  });
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => apiFetch<Team[]>("/api/teams"),
  });
  const { data: history } = useQuery({
    queryKey: ["events", eventId, "allocations", "flight"],
    queryFn: () => apiFetch<AllocationRun[]>(`/api/events/${eventId}/allocations?type_filter=flight`),
  });
  const { data: assignments, refetch: refetchAssignments } = useQuery({
    queryKey: ["events", eventId, "flight-assignments", direction],
    queryFn: () =>
      apiFetch<FlightAssignment[]>(`/api/events/${eventId}/flight-assignments?direction=${direction}`),
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
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import thất bại"),
  });

  const runAllocationMutation = useMutation({
    mutationFn: () =>
      apiFetch<AllocationEnqueued>(`/api/events/${eventId}/allocations/flight`, {
        method: "POST",
        body: JSON.stringify({ direction }),
      }),
    onSuccess: (data) => {
      toast.info("Đang chạy phân bổ...");
      setActiveJobId(data.job_id);
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
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ flightId, force }: { flightId: number; force: boolean }) =>
      apiFetch(`/api/events/${eventId}/flight-assignments/adjust`, {
        method: "POST",
        body: JSON.stringify({
          employee_ids: Array.from(selected),
          team_id: moveTeamId ? Number(moveTeamId) : null,
          flight_id: flightId,
          reason: adjustReason,
          force,
        }),
      }),
    onSuccess: () => {
      toast.success("Đã chuyển chuyến");
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

  useEffect(() => {
    if (job && (job.status === "succeeded" || job.status === "failed")) {
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "flight-assignments"] });
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
  const remainingByFlight = new Map(summary?.flights.map((f) => [f.flight_id, f.remaining]) ?? []);
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
      capacity: String(flight.capacity),
      origin: flight.origin ?? "",
      destination: flight.destination ?? "",
      depart_at: toDatetimeLocal(flight.depart_at),
      arrive_at: toDatetimeLocal(flight.arrive_at),
    });
    setFlightOpen(true);
  };

  const dirFlights = flights?.filter((f) => f.direction === direction) ?? [];
  const assignedCount = (flightId: number) =>
    (assignments ?? []).filter((a) => a.flight_id === flightId).length;
  const visibleAssignments = (assignments ?? []).filter((a) => {
    if (flagsOnly && !a.is_flagged) return false;
    if (focusFlightId !== "all" && a.flight_id !== focusFlightId) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Phân chuyến bay</h2>
          <p className="text-sm text-muted-foreground">Chọn chiều, xem slot, rồi chạy phân bổ hoặc kéo người sang chuyến khác.</p>
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
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
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
                          <span>{new Date(run.created_at).toLocaleString("vi-VN")}</span>
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
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingFlight ? "Sửa chuyến bay" : "Thêm chuyến bay"}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <FormField label="Mã chuyến" required>
                  <Input value={flightForm.flight_code} onChange={(e) => setFlightForm({ ...flightForm, flight_code: e.target.value })} />
                </FormField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Sức chứa" required>
                    <Input type="number" value={flightForm.capacity} onChange={(e) => setFlightForm({ ...flightForm, capacity: e.target.value })} />
                  </FormField>
                  <FormField label="Khởi hành">
                    <Input type="datetime-local" value={flightForm.depart_at} onChange={(e) => setFlightForm({ ...flightForm, depart_at: e.target.value })} />
                  </FormField>
                </div>
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
                  <FormField label="Hạ cánh">
                    <Input type="datetime-local" value={flightForm.arrive_at} onChange={(e) => setFlightForm({ ...flightForm, arrive_at: e.target.value })} />
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
            disabled={runAllocationMutation.isPending || job?.status === "running"}
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

      <div className="flex gap-2 overflow-x-auto pb-1">
        <ResourceCard
          title="Tất cả"
          subtitle={`${(assignments ?? []).length} người`}
          selected={focusFlightId === "all"}
          onClick={() => setFocusFlightId("all")}
        />
        {dirFlights.map((f) => {
          const n = remainingByFlight.has(f.id)
            ? f.capacity - (remainingByFlight.get(f.id) ?? 0)
            : assignedCount(f.id);
          return (
            <ResourceCard
              key={f.id}
              title={f.flight_code}
              subtitle={`${f.origin ?? "—"} → ${f.destination ?? "—"}${shifts?.find((s) => s.id === f.shift_id) ? ` · ${shifts.find((s) => s.id === f.shift_id)!.name}` : ""}`}
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
                label={`Team bị tách: ${summary.split_team_ids.map(teamName).join(", ")}`}
              />
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Danh sách phân bổ ({direction})</p>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Checkbox checked={flagsOnly} onCheckedChange={(checked) => setFlagsOnly(checked === true)} />
            Chỉ hiện flag
          </label>
          {selected.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selected.size} đã chọn</span>
              <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v ?? "")}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Chuyển tới chuyến" />
                </SelectTrigger>
                <SelectContent>
                  {flights
                    ?.filter((f) => f.direction === direction)
                    .map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.flight_code}
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
              <SelectValue placeholder="Chuyển tới chuyến" />
            </SelectTrigger>
            <SelectContent>
              {flights
                ?.filter((f) => f.direction === direction)
                .map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.flight_code}
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
        {visibleAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có người trên chuyến này — chạy phân bổ hoặc chọn “Tất cả”.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleAssignments.map((a) => {
              const assignedFlight = flights?.find((f) => f.id === a.flight_id);
              const assignedShift = shifts?.find((s) => s.id === assignedFlight?.shift_id);
              const mismatch =
                !!a.requested_shift_name && !!assignedShift && a.requested_shift_name !== assignedShift.name;
              return (
                <li key={a.employee_id}>
                  <PersonRow
                    name={a.full_name}
                    code={a.employee_code}
                    team={a.team_name}
                    selected={selected.has(a.employee_id)}
                    onSelect={(next) =>
                      setSelected((prev) => {
                        const copy = new Set(prev);
                        if (next) copy.add(a.employee_id);
                        else copy.delete(a.employee_id);
                        return copy;
                      })
                    }
                    flag={a.is_flagged ? flagReasonLabel(a.flag_reason) : null}
                    extra={
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        {assignedFlight ? (
                          <Badge variant="outline" className="font-mono">
                            {assignedFlight.flight_code}
                            {assignedShift ? ` · ${assignedShift.name}` : ""}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">Chưa xếp chuyến</span>
                        )}
                        {a.requested_shift_name && (
                          <span className={cn(mismatch ? "font-medium text-[var(--ember)]" : "text-muted-foreground")}>
                            Đăng ký: {a.requested_shift_name}
                          </span>
                        )}
                        {a.is_locked && <Badge variant="secondary">Đã ghim</Badge>}
                      </div>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
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
                onClick={() => moveTarget && adjustMutation.mutate({ flightId: Number(moveTarget), force: false })}
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
                onClick={() => moveTarget && adjustMutation.mutate({ flightId: Number(moveTarget), force: true })}
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
