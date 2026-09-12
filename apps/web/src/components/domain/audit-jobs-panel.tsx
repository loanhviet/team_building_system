"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { AuditLogEntry, Job } from "@/types/api";

export function AuditJobsPanel({ eventId }: { eventId: number }) {
  const { data: auditLogs } = useQuery({
    queryKey: ["events", eventId, "audit-logs"],
    queryFn: () => apiFetch<AuditLogEntry[]>(`/api/events/${eventId}/audit-logs?limit=30`),
  });

  const { data: jobs } = useQuery({
    queryKey: ["jobs", "recent"],
    queryFn: () => apiFetch<Job[]>("/api/jobs?limit=20"),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Audit Log (30 gần nhất)</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời gian</TableHead>
              <TableHead>Hành động</TableHead>
              <TableHead>Đối tượng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditLogs?.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(log.created_at).toLocaleString("vi-VN")}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{log.action}</Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {log.entity_type} #{log.entity_id}
                  {log.reason && <span className="text-zinc-500"> — {log.reason}</span>}
                </TableCell>
              </TableRow>
            ))}
            {(!auditLogs || auditLogs.length === 0) && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-zinc-500">
                  Chưa có thay đổi nào
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Jobs gần nhất</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loại</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Thời gian</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs?.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="text-xs">{job.type}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      job.status === "succeeded"
                        ? "default"
                        : job.status === "failed"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {job.status}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(job.created_at).toLocaleString("vi-VN")}
                </TableCell>
              </TableRow>
            ))}
            {(!jobs || jobs.length === 0) && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-zinc-500">
                  Chưa có job nào
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
