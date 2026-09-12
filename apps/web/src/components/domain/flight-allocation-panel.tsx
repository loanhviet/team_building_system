"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDownload, apiFetch, apiUpload, ApiError } from "@/lib/api";
import { assignmentSourceLabel, flagReasonLabel } from "@/lib/labels";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime";
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

  const visibleAssignments = flagsOnly ? assignments?.filter((a) => a.is_flagged) : assignments;

  const assignmentColumns: DataTableColumn<FlightAssignment>[] = [
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
      key: "flight",
      header: "Chuyến",
      cell: (a) => (
        <>
          {flights?.find((f) => f.id === a.flight_id)?.flight_code ?? "Chưa xếp"}
          {a.is_locked && (
            <Badge variant="secondary" className="ml-1">
              Ghim
            </Badge>
          )}
        </>
      ),
    },
    {
      key: "source",
      header: "Nguồn",
      cell: (a) => assignmentSourceLabel(a.source),
      sortValue: (a) => a.source,
    },
    {
      key: "flag",
      header: "Ghi chú",
      cell: (a) => (a.is_flagged ? <Badge variant="destructive">{flagReasonLabel(a.flag_reason)}</Badge> : null),
      sortValue: (a) => (a.is_flagged ? 1 : 0),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={direction} onValueChange={(v) => setDirection(v as "outbound" | "inbound")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="outbound">Chiều đi</SelectItem>
            <SelectItem value="inbound">Chiều về</SelectItem>
          </SelectContent>
        </Select>
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
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingFlight ? "Sửa chuyến bay" : "Thêm chuyến bay"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Mã chuyến</Label>
                  <Input value={flightForm.flight_code} onChange={(e) => setFlightForm({ ...flightForm, flight_code: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Hãng</Label>
                  <Input value={flightForm.airline} onChange={(e) => setFlightForm({ ...flightForm, airline: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Chiều</Label>
                  <Select value={flightForm.direction} onValueChange={(v) => setFlightForm({ ...flightForm, direction: v ?? "outbound" })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outbound">outbound (đi)</SelectItem>
                      <SelectItem value="inbound">inbound (về)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Ca</Label>
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
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Sức chứa</Label>
                  <Input type="number" value={flightForm.capacity} onChange={(e) => setFlightForm({ ...flightForm, capacity: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Điểm đi</Label>
                  <Input value={flightForm.origin} onChange={(e) => setFlightForm({ ...flightForm, origin: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Điểm đến</Label>
                  <Input value={flightForm.destination} onChange={(e) => setFlightForm({ ...flightForm, destination: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Khởi hành</Label>
                  <Input type="datetime-local" value={flightForm.depart_at} onChange={(e) => setFlightForm({ ...flightForm, depart_at: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Hạ cánh</Label>
                  <Input type="datetime-local" value={flightForm.arrive_at} onChange={(e) => setFlightForm({ ...flightForm, arrive_at: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button disabled={!flightForm.flight_code || saveFlight.isPending} onClick={() => saveFlight.mutate()}>
                  Lưu
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            size="sm"
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã</TableHead>
            <TableHead>Chiều</TableHead>
            <TableHead>Ca</TableHead>
            <TableHead>Sức chứa</TableHead>
            <TableHead>Còn trống</TableHead>
            <TableHead>Hành trình</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {flights
            ?.filter((f) => f.direction === direction)
            .map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-mono">{f.flight_code}</TableCell>
                <TableCell>{f.direction}</TableCell>
                <TableCell>{shifts?.find((s) => s.id === f.shift_id)?.name ?? "—"}</TableCell>
                <TableCell>{f.capacity}</TableCell>
                <TableCell>{remainingByFlight.has(f.id) ? remainingByFlight.get(f.id) : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {f.origin ?? "—"} → {f.destination ?? "—"}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => openEditFlight(f)}>
                    Sửa
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>

      {job && (job.status === "queued" || job.status === "running") && (
        <p className="text-sm text-muted-foreground">Đang chạy phân bổ...</p>
      )}
      {summary && (
        <div className="rounded-md border p-4 text-sm">
          <p>
            Đã xếp: <b>{summary.total_assigned}</b>/{summary.total_submitted} — Cần xử lý:{" "}
            <b>{summary.total_flagged}</b>
          </p>
          {summary.split_team_ids.length > 0 && (
            <p className="mt-1 text-muted-foreground">
              Team bị tách: {summary.split_team_ids.map(teamName).join(", ")}
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
        <DataTable
          columns={assignmentColumns}
          rows={visibleAssignments ?? []}
          rowKey={(a) => a.employee_id}
          emptyMessage="Chưa có dữ liệu — hãy chạy phân bổ hoặc chờ CBNV đăng ký"
        />
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
