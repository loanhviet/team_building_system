"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PersonRow } from "@/components/domain/person-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const rows = data ?? [];
  const byTeam = useMemo(() => {
    const map = new Map<string, RegistrationAdmin[]>();
    for (const r of rows) {
      const key = r.team_name ?? "Chưa có team";
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "vi"));
  }, [rows]);

  const submitted = rows.filter((r) => r.status === "submitted").length;
  const participating = rows.filter((r) => r.is_participating).length;

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Đăng ký</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Đang tải…"
              : `${submitted} đã gửi · ${participating} tham gia · ${rows.length} trong bộ lọc`}
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={downloading}>
          Export Excel
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
        <Input
          placeholder="Tìm tên, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-11 w-full sm:w-64"
        />
        <Select
          value={statusFilter || ALL}
          onValueChange={(v) => setStatusFilter(v === ALL ? "" : (v ?? ""))}
        >
          <SelectTrigger className="min-h-11 w-40">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
            <SelectItem value="draft">Nháp</SelectItem>
            <SelectItem value="submitted">Đã gửi</SelectItem>
            <SelectItem value="cancelled">Đã huỷ</SelectItem>
          </SelectContent>
        </Select>
        <Select value={teamId || ALL} onValueChange={(v) => setTeamId(v === ALL ? "" : (v ?? ""))}>
          <SelectTrigger className="min-h-11 w-44">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi team</SelectItem>
            {teams?.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={shiftId || ALL} onValueChange={(v) => setShiftId(v === ALL ? "" : (v ?? ""))}>
          <SelectTrigger className="min-h-11 w-36">
            <SelectValue placeholder="Ca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi ca</SelectItem>
            {shifts?.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilter && (
          <Button variant="ghost" onClick={clearFilters}>
            Xoá lọc
          </Button>
        )}
      </div>

      {byTeam.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">Chưa có ai đăng ký.</p>
      )}

      {byTeam.map(([team, members]) => (
        <section key={team}>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {team} · {members.length}
          </h3>
          <ul className="flex flex-col gap-2">
            {members.map((r) => (
              <li key={r.id}>
                <PersonRow
                  name={r.full_name}
                  code={r.employee_code}
                  team={r.shift_name}
                  extra={
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {STATUS_LABEL[r.status] ?? r.status}
                      {r.is_participating === false
                        ? " · Không tham gia"
                        : r.is_participating
                          ? " · Có tham gia"
                          : ""}
                      {r.transport_summary ? ` · ${r.transport_summary}` : ""}
                      {r.wish_note ? ` · “${r.wish_note}”` : ""}
                    </p>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
