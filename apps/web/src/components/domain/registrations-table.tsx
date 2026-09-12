"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDownload, apiFetch, ApiError } from "@/lib/api";
import type { RegistrationAdmin, Shift, Team } from "@/types/api";

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  submitted: "Đã gửi",
  cancelled: "Đã huỷ",
};

export function RegistrationsTable({ eventId }: { eventId: number }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [teamId, setTeamId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [downloading, setDownloading] = useState(false);

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => apiFetch<Team[]>("/api/teams"),
  });
  const { data: shifts } = useQuery({
    queryKey: ["events", eventId, "shifts"],
    queryFn: () => apiFetch<Shift[]>(`/api/events/${eventId}/shifts`),
  });

  const qs = [
    search ? `search=${encodeURIComponent(search)}` : "",
    statusFilter ? `status_filter=${statusFilter}` : "",
    teamId ? `team_id=${teamId}` : "",
    shiftId ? `shift_id=${shiftId}` : "",
  ]
    .filter(Boolean)
    .join("&");

  const { data, isLoading } = useQuery({
    queryKey: ["events", eventId, "registrations", { search, statusFilter, teamId, shiftId }],
    queryFn: () =>
      apiFetch<RegistrationAdmin[]>(`/api/events/${eventId}/registrations${qs ? `?${qs}` : ""}`),
  });

  const handleExport = async () => {
    setDownloading(true);
    try {
      await apiDownload(
        `/api/events/${eventId}/registrations/export`,
        `registrations_event_${eventId}.xlsx`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Tải file thất bại");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Tìm theo tên, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Nháp</SelectItem>
              <SelectItem value="submitted">Đã gửi</SelectItem>
              <SelectItem value="cancelled">Đã huỷ</SelectItem>
            </SelectContent>
          </Select>
          <Select value={teamId} onValueChange={(v) => setTeamId(v ?? "")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              {teams?.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={shiftId} onValueChange={(v) => setShiftId(v ?? "")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Ca" />
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
        <Button variant="outline" size="sm" onClick={handleExport} disabled={downloading}>
          Export Excel
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã NV</TableHead>
            <TableHead>Họ tên</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Tham gia</TableHead>
            <TableHead>Ca</TableHead>
            <TableHead>Xe</TableHead>
            <TableHead>Mong muốn</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-zinc-500">
                Đang tải...
              </TableCell>
            </TableRow>
          )}
          {!isLoading && data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-zinc-500">
                Chưa có ai đăng ký
              </TableCell>
            </TableRow>
          )}
          {data?.map((reg) => (
            <TableRow key={reg.id}>
              <TableCell className="font-mono">{reg.employee_code ?? "—"}</TableCell>
              <TableCell>{reg.full_name}</TableCell>
              <TableCell>{reg.team_name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline">{STATUS_LABEL[reg.status] ?? reg.status}</Badge>
              </TableCell>
              <TableCell>
                {reg.is_participating === null ? "—" : reg.is_participating ? "Có" : "Không"}
              </TableCell>
              <TableCell>{reg.shift_name ?? "—"}</TableCell>
              <TableCell className="max-w-[12rem] truncate">{reg.transport_summary ?? "—"}</TableCell>
              <TableCell className="max-w-xs truncate">{reg.wish_note ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
