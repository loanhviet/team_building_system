"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { buttonVariants } from "@/components/ui/button";
import { apiDownload, apiFetch, ApiError } from "@/lib/api";
import type { AllocationEnqueued, Bus, BusAssignment, Job, TransportLeg } from "@/types/api";

export function BusAllocationPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const [legId, setLegId] = useState<number | null>(null);
  const [busDialogOpen, setBusDialogOpen] = useState(false);
  const [busCode, setBusCode] = useState("");
  const [busCapacity, setBusCapacity] = useState("16");
  const [leaderName, setLeaderName] = useState("");
  const [leaderPhone, setLeaderPhone] = useState("");
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [moveTarget, setMoveTarget] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustReason, setAdjustReason] = useState("Điều chỉnh thủ công từ Admin");
  const [overCapacityMsg, setOverCapacityMsg] = useState<string | null>(null);

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

  const createBusMutation = useMutation({
    mutationFn: () =>
      apiFetch<Bus>(`/api/events/${eventId}/buses`, {
        method: "POST",
        body: JSON.stringify({
          leg_id: currentLegId,
          code: busCode,
          capacity: Number(busCapacity),
          leader_name: leaderName || null,
          leader_phone: leaderPhone || null,
        }),
      }),
    onSuccess: () => {
      toast.success("Đã thêm xe");
      setBusDialogOpen(false);
      setBusCode("");
      setLeaderName("");
      setLeaderPhone("");
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
          bus_id: busId,
          reason: adjustReason,
          force,
        }),
      }),
    onSuccess: () => {
      toast.success("Đã chuyển xe");
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

  const summary = job?.result_json as
    | { total_needed: number; total_assigned: number; total_flagged: number;
        buses: { bus_id: number; capacity: number; assigned: number; remaining: number }[] }
    | undefined;

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
            <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
              Thêm xe
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Thêm xe cho chặng này</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bus-code">Mã xe</Label>
                  <Input id="bus-code" value={busCode} onChange={(e) => setBusCode(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bus-capacity">Sức chứa</Label>
                  <Input
                    id="bus-capacity"
                    type="number"
                    value={busCapacity}
                    onChange={(e) => setBusCapacity(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="leader-name">Trưởng xe</Label>
                  <Input
                    id="leader-name"
                    value={leaderName}
                    onChange={(e) => setLeaderName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="leader-phone">SĐT Trưởng xe</Label>
                  <Input
                    id="leader-phone"
                    value={leaderPhone}
                    onChange={(e) => setLeaderPhone(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!busCode || createBusMutation.isPending}
                  onClick={() => createBusMutation.mutate()}
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
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã xe</TableHead>
            <TableHead>Sức chứa</TableHead>
            <TableHead>Trưởng xe</TableHead>
            <TableHead>SĐT</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buses?.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono">{b.code}</TableCell>
              <TableCell>{b.capacity}</TableCell>
              <TableCell>{b.leader_name ?? "—"}</TableCell>
              <TableCell>{b.leader_phone ?? "—"}</TableCell>
            </TableRow>
          ))}
          {(!buses || buses.length === 0) && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Chưa có xe cho chặng này
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

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
        <div className="flex items-center gap-2">
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
              <TableHead>Xe</TableHead>
              <TableHead>Nguồn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments?.map((a) => (
              <TableRow key={a.employee_id}>
                <TableCell>
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
                </TableCell>
                <TableCell className="font-mono">{a.employee_code ?? "—"}</TableCell>
                <TableCell>{a.full_name}</TableCell>
                <TableCell>{a.team_name ?? "—"}</TableCell>
                <TableCell>
                  {buses?.find((b) => b.id === a.bus_id)?.code ?? "Chưa xếp"}
                  {a.is_locked && (
                    <Badge variant="secondary" className="ml-1">
                      Ghim
                    </Badge>
                  )}
                  {a.is_flagged && (
                    <Badge variant="destructive" className="ml-1">
                      {a.flag_reason}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{a.source}</TableCell>
              </TableRow>
            ))}
            {(!assignments || assignments.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Chưa có dữ liệu
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Điều chỉnh xe</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Chuyển {selected.size} người sang xe đã chọn. Cần ghi lý do (audit log).
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
                onClick={() => moveTarget && adjustMutation.mutate({ busId: Number(moveTarget), force: false })}
              >
                Xác nhận
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={!adjustReason.trim() || adjustMutation.isPending}
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
