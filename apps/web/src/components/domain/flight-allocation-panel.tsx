"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EntityCrudTable } from "@/components/domain/entity-crud-table";
import { apiFetch, apiUpload, ApiError } from "@/lib/api";
import type { AllocationEnqueued, Flight, FlightAssignment, Job } from "@/types/api";

const FLAG_LABEL: Record<string, string> = {
  no_slot: "Không còn chỗ",
  shift_mismatch: "Sai ca đăng ký",
};

export function FlightAllocationPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [moveTarget, setMoveTarget] = useState<string>("");

  const { data: flights } = useQuery({
    queryKey: ["events", eventId, "flights"],
    queryFn: () => apiFetch<Flight[]>(`/api/events/${eventId}/flights`),
  });

  const { data: assignments, refetch: refetchAssignments } = useQuery({
    queryKey: ["events", eventId, "flight-assignments", direction],
    queryFn: () =>
      apiFetch<FlightAssignment[]>(
        `/api/events/${eventId}/flight-assignments?direction=${direction}`,
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

  const adjustMutation = useMutation({
    mutationFn: (flightId: number) =>
      apiFetch(`/api/events/${eventId}/flight-assignments/adjust`, {
        method: "POST",
        body: JSON.stringify({
          employee_ids: Array.from(selected),
          flight_id: flightId,
          reason: "Điều chỉnh thủ công từ Admin",
          force: true,
        }),
      }),
    onSuccess: () => {
      toast.success("Đã chuyển chuyến");
      setSelected(new Set());
      setMoveTarget("");
      refetchAssignments();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Select value={direction} onValueChange={(v) => setDirection(v as "outbound" | "inbound")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="outbound">Chiều đi</SelectItem>
            <SelectItem value="inbound">Chiều về</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
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
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Import chuyến bay
          </Button>
          <Button
            size="sm"
            onClick={() => runAllocationMutation.mutate()}
            disabled={runAllocationMutation.isPending || job?.status === "running"}
          >
            Chạy phân bổ tự động
          </Button>
        </div>
      </div>

      <EntityCrudTable
        queryKey={["events", String(eventId), "flights"]}
        label="chuyến bay"
        basePath={`/api/events/${eventId}/flights`}
        fields={[
          { name: "flight_code", label: "Mã chuyến" },
          { name: "direction", label: "outbound/inbound" },
          { name: "capacity", label: "Sức chứa" },
          { name: "shift_id", label: "Shift ID", required: false },
        ]}
      />

      {job && (job.status === "queued" || job.status === "running") && (
        <p className="text-sm text-zinc-500">Đang chạy phân bổ...</p>
      )}

      {summary && (
        <div className="rounded-md border p-4 text-sm">
          <p>
            Đã xếp: <b>{summary.total_assigned}</b>/{summary.total_submitted} — Cần xử lý:{" "}
            <b>{summary.total_flagged}</b> — Team bị tách: {summary.split_team_ids.length}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {summary.flights.map((f) => {
              const flight = flights?.find((fl) => fl.id === f.flight_id);
              return (
                <Badge key={f.flight_id} variant="outline">
                  {flight?.flight_code ?? f.flight_id}: {f.assigned}/{f.capacity}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Danh sách đã submit ({direction})</p>
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
                disabled={!moveTarget || adjustMutation.isPending}
                onClick={() => moveTarget && adjustMutation.mutate(Number(moveTarget))}
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
            {assignments?.map((a) => (
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
                    <Badge variant="destructive">
                      {FLAG_LABEL[a.flag_reason ?? ""] ?? a.flag_reason}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(!assignments || assignments.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-zinc-500">
                  Chưa có dữ liệu — hãy chạy phân bổ hoặc chờ CBNV đăng ký
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
