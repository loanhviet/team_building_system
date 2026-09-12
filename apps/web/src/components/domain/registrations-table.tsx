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
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { apiDownload, apiFetch, ApiError } from "@/lib/api";
import type { RegistrationAdmin, Shift, Team } from "@/types/api";

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  submitted: "Đã gửi",
  cancelled: "Đã huỷ",
};

const ALL = "__all__";

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

  const hasFilter = !!(search || statusFilter || teamId || shiftId);
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setTeamId("");
    setShiftId("");
  };

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
        `/api/events/${eventId}/registrations/export${qs ? `?${qs}` : ""}`,
        `registrations_event_${eventId}.xlsx`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Tải file thất bại");
    } finally {
      setDownloading(false);
    }
  };

  const columns: DataTableColumn<RegistrationAdmin>[] = [
    { key: "employee_code", header: "Mã NV", cell: (r) => r.employee_code ?? "—", sortValue: (r) => r.employee_code },
    { key: "full_name", header: "Họ tên", cell: (r) => r.full_name, sortValue: (r) => r.full_name },
    { key: "team_name", header: "Team", cell: (r) => r.team_name ?? "—", sortValue: (r) => r.team_name },
    {
      key: "status",
      header: "Trạng thái",
      cell: (r) => <Badge variant="outline">{STATUS_LABEL[r.status] ?? r.status}</Badge>,
      sortValue: (r) => r.status,
    },
    {
      key: "is_participating",
      header: "Tham gia",
      cell: (r) => (r.is_participating === null ? "—" : r.is_participating ? "Có" : "Không"),
    },
    { key: "shift_name", header: "Ca", cell: (r) => r.shift_name ?? "—", sortValue: (r) => r.shift_name },
    {
      key: "transport_summary",
      header: "Xe",
      cell: (r) => <span className="block max-w-[12rem] truncate">{r.transport_summary ?? "—"}</span>,
    },
    {
      key: "wish_note",
      header: "Mong muốn",
      cell: (r) => <span className="block max-w-xs truncate">{r.wish_note ?? "—"}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      isLoading={isLoading}
      emptyMessage="Chưa có ai đăng ký"
      pageSize={20}
      toolbar={
        <>
          <Input
            placeholder="Tìm theo tên, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select
            value={statusFilter || ALL}
            onValueChange={(v) => setStatusFilter(v === ALL ? "" : (v ?? ""))}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả</SelectItem>
              <SelectItem value="draft">Nháp</SelectItem>
              <SelectItem value="submitted">Đã gửi</SelectItem>
              <SelectItem value="cancelled">Đã huỷ</SelectItem>
            </SelectContent>
          </Select>
          <Select value={teamId || ALL} onValueChange={(v) => setTeamId(v === ALL ? "" : (v ?? ""))}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả</SelectItem>
              {teams?.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={shiftId || ALL} onValueChange={(v) => setShiftId(v === ALL ? "" : (v ?? ""))}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Ca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả</SelectItem>
              {shifts?.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Xoá lọc
            </Button>
          )}
          <Button variant="outline" size="sm" className="ml-auto" onClick={handleExport} disabled={downloading}>
            Export Excel
          </Button>
        </>
      }
    />
  );
}
