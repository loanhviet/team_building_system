"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Download, Eye, Info, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { StatusChip } from "@/components/domain/status-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiDownload, apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Dashboard, RegistrationAdmin, Shift, Team } from "@/types/api";

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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<RegistrationAdmin | null>(null);

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => apiFetch<Team[]>("/api/teams"),
  });
  const { data: shifts } = useQuery({
    queryKey: ["events", eventId, "shifts"],
    queryFn: () => apiFetch<Shift[]>(`/api/events/${eventId}/shifts`),
  });
  const { data: dashboard } = useQuery({
    queryKey: ["events", eventId, "dashboard"],
    queryFn: () => apiFetch<Dashboard>(`/api/events/${eventId}/dashboard`),
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

  const rows = useMemo(() => data ?? [], [data]);
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

  // count comes from the API, not from `rows`: the list only contains people who
  // already have a registration row, and the reminder deliberately also targets
  // CBNV who never opened the form. 0 when the window isn't open.
  const remindable = dashboard?.remindable_count ?? 0;

  const remindMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ queued: number }>(`/api/events/${eventId}/registrations/remind`, { method: "POST" }),
    onSuccess: (res) => toast.success(`Đã xếp hàng ${res.queued} email nhắc chưa gửi`),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không gửi được nhắc"),
  });

  const toggleTeam = (team: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Quản lý đăng ký tham gia
            </h2>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {isLoading ? "…" : `${rows.length} nhân sự`}
            </span>
          </div>
          <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {isLoading ? (
              "Đang tải…"
            ) : (
              <span>
                <strong className="text-foreground">{submitted}</strong> đã gửi ·{" "}
                <strong className="text-emerald-700">{participating}</strong> tham gia ·{" "}
                <strong className="text-primary">{rows.length}</strong> trong bộ lọc
                {dashboard ? ` (Tổng hồ sơ: ${dashboard.total_employees})` : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmDialog
            trigger={
              <Button variant="outline" disabled={remindable === 0 || remindMutation.isPending}>
                <Mail className="size-4" aria-hidden="true" />
                Nhắc nhở chưa gửi ({remindable})
              </Button>
            }
            title="Gửi email nhắc những người chưa nộp đăng ký?"
            description={`Sẽ xếp hàng ${remindable} email tới toàn bộ CBNV chưa gửi đăng ký — gồm cả người chưa từng mở form. Người đã huỷ đăng ký không bị nhắc. Mỗi người tối đa một nhắc trong ngày.`}
            confirmLabel="Gửi nhắc"
            onConfirm={async () => {
              await remindMutation.mutateAsync();
            }}
          />
          <Button onClick={handleExport} disabled={downloading}>
            <Download className="size-4" aria-hidden="true" />
            Export Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-center gap-2.5 rounded-xl border border-border bg-card p-3.5 shadow-[var(--shadow-card)] md:grid-cols-12">
        <Input
          placeholder="Tìm tên, mã NV, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:col-span-4"
        />
        <Select
          value={statusFilter || ALL}
          onValueChange={(v) => setStatusFilter(v === ALL ? "" : (v ?? ""))}
        >
          <SelectTrigger className="md:col-span-2">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            <SelectItem value="draft">Nháp</SelectItem>
            <SelectItem value="submitted">Đã gửi</SelectItem>
            <SelectItem value="cancelled">Đã huỷ</SelectItem>
          </SelectContent>
        </Select>
        <Select value={teamId || ALL} onValueChange={(v) => setTeamId(v === ALL ? "" : (v ?? ""))}>
          <SelectTrigger className="md:col-span-3">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả Team</SelectItem>
            {teams?.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={shiftId || ALL} onValueChange={(v) => setShiftId(v === ALL ? "" : (v ?? ""))}>
          <SelectTrigger className="md:col-span-2">
            <SelectValue placeholder="Ca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả ca</SelectItem>
            {shifts?.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="md:col-span-1"
          onClick={clearFilters}
          disabled={!hasFilter}
        >
          Đặt lại
        </Button>
      </div>

      {byTeam.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">Chưa có ai đăng ký.</p>
      )}

      {byTeam.map(([team, members]) => {
        const going = members.filter((m) => m.is_participating).length;
        const pct = members.length ? Math.round((going / members.length) * 100) : 0;
        const code = members.find((m) => m.team_code)?.team_code;
        const open = !collapsed.has(team);
        return (
          <section key={team} className="surface-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleTeam(team)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              {code && (
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">
                  {code.replace(/\D/g, "").slice(-2).padStart(2, "0") || code.slice(0, 2)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{team}</p>
                <p className="text-xs text-muted-foreground">{members.length} thành viên</p>
              </div>
              <p className="shrink-0 text-xs font-semibold text-emerald-700">
                Tỷ lệ tham gia: {going}/{members.length} ({pct}%)
              </p>
              <ChevronDown
                className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            {open && (
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-slate-50 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      <th className="px-4 py-2.5 font-semibold">Họ và tên & mã NV</th>
                      <th className="px-3 py-2.5 font-semibold">Chức danh</th>
                      <th className="px-3 py-2.5 font-semibold">Ca di chuyển</th>
                      <th className="px-3 py-2.5 font-semibold">Trạng thái hồ sơ</th>
                      <th className="px-3 py-2.5 font-semibold">Tham gia</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {members.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/40">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <InitialsAvatar name={r.full_name} className="size-9" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{r.full_name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {r.employee_code ?? "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.position ?? "—"}</td>
                        <td className="px-3 py-2.5">{r.shift_name ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <StatusChip
                            kind={
                              r.status === "submitted"
                                ? "confirmed"
                                : r.status === "cancelled"
                                  ? "unavailable"
                                  : "locking"
                            }
                            label={STATUS_LABEL[r.status] ?? r.status}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          {r.is_participating === false ? (
                            <StatusChip kind="unavailable" label="Không tham gia" />
                          ) : r.is_participating ? (
                            <StatusChip kind="confirmed" label="Có tham gia" />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Xem ${r.full_name}`}
                            onClick={() => setViewing(r)}
                          >
                            <Eye className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewing?.full_name}</DialogTitle>
            <DialogDescription>
              {[viewing?.employee_code, viewing?.email].filter(Boolean).join(" · ")}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Team</dt>
                <dd className="font-medium">{viewing.team_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Chức danh</dt>
                <dd className="font-medium">{viewing.position ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Trạng thái</dt>
                <dd className="font-medium">{STATUS_LABEL[viewing.status] ?? viewing.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tham gia</dt>
                <dd className="font-medium">
                  {viewing.is_participating === false
                    ? "Không tham gia"
                    : viewing.is_participating
                      ? "Có tham gia"
                      : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ca</dt>
                <dd className="font-medium">{viewing.shift_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Xe</dt>
                <dd className="font-medium">{viewing.transport_summary ?? "Không đăng ký xe"}</dd>
              </div>
              {viewing.wish_note && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Mong muốn</dt>
                  <dd className="font-medium">“{viewing.wish_note}”</dd>
                </div>
              )}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
