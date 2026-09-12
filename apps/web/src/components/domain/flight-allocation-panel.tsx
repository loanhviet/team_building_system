"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime";
import type { AllocationEnqueued, Flight, FlightAssignment, Job, Shift } from "@/types/api";

const FLAG_LABEL: Record<string, string> = {
  no_slot: "Không còn chỗ",
  shift_mismatch: "Sai ca đăng ký",
};

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
  const [flagsOnly, setFlagsOnly] = useState(false);
  const [flightOpen, setFlightOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState<Flight | null>(null);
  const [flightForm, setFlightForm] = useState(EMPTY_FLIGHT);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustReason, setAdjustReason] = useState("Điều chỉnh thủ công từ Admin");
  const [overCapacityMsg, setOverCapacityMsg] = useState<string | null>(null);

  const { data: flights } = useQuery({
    queryKey: ["events", eventId, "flights"],
    queryFn: () => apiFetch<Flight[]>(`/api/events/${eventId}/flights`),
  });
  const { data: shifts } = useQuery({
    queryKey: ["events", eventId, "shifts"],
    queryFn: () => apiFetch<Shift[]>(`/api/events/${eventId}/shifts`),
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
          flight_id: flightId,
          reason: adjustReason,
          force,
        }),
      }),
    onSuccess: () => {
      toast.success("Đã chuyển chuyến");
      setSelected(new Set());
      setMoveTarget("");
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

  const summary = job?.result_json as
    | {
        total_submitted: number;
        total_assigned: number;
        total_flagged: number;
        split_team_ids: number[];
        flights: { flight_id: number; capacity: number; assigned: number; remaining: number }[];
      }
    | undefined;

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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã</TableHead>
            <TableHead>Chiều</TableHead>
            <TableHead>Ca</TableHead>
            <TableHead>Sức chứa</TableHead>
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
                <TableCell className="text-sm text-zinc-500">
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
        <p className="text-sm text-zinc-500">Đang chạy phân bổ...</p>
      )}
      {summary && (
        <div className="rounded-md border p-4 text-sm">
          <p>
            Đã xếp: <b>{summary.total_assigned}</b>/{summary.total_submitted} — Cần xử lý:{" "}
            <b>{summary.total_flagged}</b> — Team bị tách: {summary.split_team_ids.length}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Danh sách phân bổ ({direction})</p>
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            <input type="checkbox" checked={flagsOnly} onChange={(e) => setFlagsOnly(e.target.checked)} />
            Chỉ hiện flag
          </label>
          {selected.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-zinc-500">{selected.size} đã chọn</span>
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
                  setOverCapacityMsg(null);
                  setAdjustOpen(true);
                }}
              >
                Chuyển
              </Button>
            </div>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Mã NV</TableHead>
              <TableHead>Họ tên</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Chuyến</TableHead>
              <TableHead>Nguồn</TableHead>
              <TableHead>Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleAssignments?.map((a) => (
              <TableRow key={a.employee_id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(a.employee_id)}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(a.employee_id);
                        else next.delete(a.employee_id);
                        return next;
                      })
                    }
                  />
                </TableCell>
                <TableCell className="font-mono">{a.employee_code ?? "—"}</TableCell>
                <TableCell>{a.full_name}</TableCell>
                <TableCell>{a.team_name ?? "—"}</TableCell>
                <TableCell>
                  {flights?.find((f) => f.id === a.flight_id)?.flight_code ?? "Chưa xếp"}
                  {a.is_locked && (
                    <Badge variant="secondary" className="ml-1">
                      Ghim
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{a.source}</TableCell>
                <TableCell>
                  {a.is_flagged && (
                    <Badge variant="destructive">{FLAG_LABEL[a.flag_reason ?? ""] ?? a.flag_reason}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(!visibleAssignments || visibleAssignments.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-zinc-500">
                  Chưa có dữ liệu — hãy chạy phân bổ hoặc chờ CBNV đăng ký
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Điều chỉnh chuyến bay</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-500">
              Chuyển {selected.size} người sang chuyến đã chọn. Cần ghi lý do (audit log).
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Lý do</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
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
                disabled={!adjustReason.trim() || adjustMutation.isPending}
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
