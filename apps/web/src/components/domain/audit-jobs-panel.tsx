"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { auditActionLabel, auditEntityTypeLabel, jobStatusLabel, jobTypeLabel } from "@/lib/labels";
import type { AuditLogEntry, Job } from "@/types/api";

const ALL = "__all__";

function JsonDiff({ before, after }: { before: unknown; after: unknown }) {
  if (!before && !after) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        Xem before/after
      </summary>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <pre className="overflow-x-auto rounded bg-muted p-2 text-[11px]">
          {before ? JSON.stringify(before, null, 2) : "—"}
        </pre>
        <pre className="overflow-x-auto rounded bg-muted p-2 text-[11px]">
          {after ? JSON.stringify(after, null, 2) : "—"}
        </pre>
      </div>
    </details>
  );
}

export function AuditJobsPanel({ eventId }: { eventId: number }) {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [downloading, setDownloading] = useState(false);

  const qs = [
    action ? `action=${encodeURIComponent(action)}` : "",
    entityType ? `entity_type=${encodeURIComponent(entityType)}` : "",
    since ? `since=${encodeURIComponent(since)}` : "",
    until ? `until=${encodeURIComponent(until)}` : "",
  ]
    .filter(Boolean)
    .join("&");

  const { data: auditLogs, isLoading: auditLoading } = useQuery({
    queryKey: ["events", eventId, "audit-logs", { action, entityType, since, until }],
    queryFn: () =>
      apiFetch<AuditLogEntry[]>(
        `/api/events/${eventId}/audit-logs?limit=500${qs ? `&${qs}` : ""}`,
      ),
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["jobs", "recent", eventId],
    queryFn: () => apiFetch<Job[]>(`/api/jobs?limit=50&event_id=${eventId}`),
  });

  const actionOptions = useMemo(
    () => Array.from(new Set((auditLogs ?? []).map((l) => l.action))).sort(),
    [auditLogs],
  );
  const entityTypeOptions = useMemo(
    () => Array.from(new Set((auditLogs ?? []).map((l) => l.entity_type))).sort(),
    [auditLogs],
  );

  const hasFilter = !!(action || entityType || since || until);
  const clearFilters = () => {
    setAction("");
    setEntityType("");
    setSince("");
    setUntil("");
  };

  const handleExport = async () => {
    setDownloading(true);
    try {
      await apiDownload(
        `/api/events/${eventId}/audit-logs/export${qs ? `?${qs}` : ""}`,
        `audit_event_${eventId}.csv`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Tải file thất bại");
    } finally {
      setDownloading(false);
    }
  };

  const auditColumns: DataTableColumn<AuditLogEntry>[] = [
    {
      key: "created_at",
      header: "Thời gian",
      cell: (log) => (
        <span className="whitespace-nowrap text-xs">{new Date(log.created_at).toLocaleString("vi-VN")}</span>
      ),
      sortValue: (log) => log.created_at,
    },
    {
      key: "actor_email",
      header: "Người thực hiện",
      cell: (log) => <span className="text-xs">{log.actor_email ?? "Hệ thống"}</span>,
      sortValue: (log) => log.actor_email,
    },
    {
      key: "action",
      header: "Hành động",
      cell: (log) => <Badge variant="outline">{auditActionLabel(log.action)}</Badge>,
      sortValue: (log) => log.action,
    },
    {
      key: "entity",
      header: "Đối tượng",
      cell: (log) => (
        <div className="text-xs">
          {auditEntityTypeLabel(log.entity_type)} #{log.entity_id}
          {log.reason && <span className="text-muted-foreground"> — {log.reason}</span>}
          <JsonDiff before={log.before_json} after={log.after_json} />
        </div>
      ),
    },
  ];

  const jobColumns: DataTableColumn<Job>[] = [
    { key: "type", header: "Loại", cell: (j) => <span className="text-xs">{jobTypeLabel(j.type)}</span> },
    {
      key: "status",
      header: "Trạng thái",
      cell: (j) => (
        <Badge
          variant={j.status === "succeeded" ? "default" : j.status === "failed" ? "destructive" : "outline"}
        >
          {jobStatusLabel(j.status)}
        </Badge>
      ),
      sortValue: (j) => j.status,
    },
    {
      key: "created_at",
      header: "Thời gian",
      cell: (j) => <span className="whitespace-nowrap text-xs">{new Date(j.created_at).toLocaleString("vi-VN")}</span>,
      sortValue: (j) => j.created_at,
    },
  ];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Select value={action || ALL} onValueChange={(v) => setAction(v === ALL ? "" : (v ?? ""))}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Hành động" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả</SelectItem>
            {actionOptions.map((a) => (
              <SelectItem key={a} value={a}>
                {auditActionLabel(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={entityType || ALL}
          onValueChange={(v) => setEntityType(v === ALL ? "" : (v ?? ""))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Đối tượng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả</SelectItem>
            {entityTypeOptions.map((e) => (
              <SelectItem key={e} value={e}>
                {auditEntityTypeLabel(e)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleExport} disabled={downloading}>
          Export CSV
        </Button>
        {hasFilter && (
          <Button variant="ghost" onClick={clearFilters}>
            Xoá lọc
          </Button>
        )}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Nhật ký</h2>
        {auditLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        {(auditLogs ?? []).length === 0 && !auditLoading && (
          <p className="text-sm text-muted-foreground">Chưa có thay đổi nào.</p>
        )}
        <ol className="flex flex-col">
          {(auditLogs ?? []).slice(0, 40).map((log) => (
            <li key={log.id} className="border-b border-border py-3 last:border-0">
              <p className="text-sm">
                <span className="font-medium">{auditActionLabel(log.action)}</span>
                {" · "}
                {auditEntityTypeLabel(log.entity_type)} #{log.entity_id}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString("vi-VN")} · {log.actor_email ?? "Hệ thống"}
                {log.reason ? ` · ${log.reason}` : ""}
              </p>
              <JsonDiff before={log.before_json} after={log.after_json} />
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Job nền</h2>
        {jobsLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        <ul className="flex flex-col gap-2">
          {(jobs ?? []).slice(0, 8).map((j) => (
            <li key={j.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <span>{jobTypeLabel(j.type)}</span>
              <span className="text-muted-foreground">{jobStatusLabel(j.status)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
