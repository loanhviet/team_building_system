"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { StatusChip } from "@/components/domain/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { formatUtcDateTime, parseApiDateTime } from "@/lib/format";
import { emailOutboxStatusLabel } from "@/lib/labels";
import type { EmailOutboxEntry } from "@/types/api";

const ALL = "__all__";
const STUCK_AFTER_MS = 10 * 60 * 1000;

// R7 E2: a stuck queued/failed email was previously invisible to BTC — no
// list, no way to see it, no way to send it again. This is that list.
export function EmailOutboxPanel({
  eventId,
  templateTitleOf,
}: {
  eventId: number;
  templateTitleOf: (code: string) => string;
}) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState(ALL);

  const queryKey = ["events", eventId, "email-outbox", statusFilter];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<EmailOutboxEntry[]>(
        `/api/events/${eventId}/email-outbox${statusFilter !== ALL ? `?status_filter=${statusFilter}` : ""}`,
      ),
  });

  const retryMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch<EmailOutboxEntry>(`/api/events/${eventId}/email-outbox/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Đã xếp lại vào hàng gửi");
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "email-outbox"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const isStuck = (row: EmailOutboxEntry) =>
    row.status === "queued" && Date.now() - parseApiDateTime(row.created_at).getTime() > STUCK_AFTER_MS;

  const columns: DataTableColumn<EmailOutboxEntry>[] = [
    {
      key: "to_email",
      header: "Người nhận",
      cell: (r) => r.to_email,
      sortValue: (r) => r.to_email,
    },
    {
      key: "template",
      header: "Mẫu",
      cell: (r) => templateTitleOf(r.template_code),
      sortValue: (r) => r.template_code,
    },
    {
      key: "status",
      header: "Trạng thái",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {r.status === "sent" && <StatusChip kind="confirmed" label={emailOutboxStatusLabel(r.status)} />}
          {r.status === "failed" && <StatusChip kind="flag" label={emailOutboxStatusLabel(r.status)} />}
          {(r.status === "queued" || r.status === "sending") && (
            <Badge variant="outline">{emailOutboxStatusLabel(r.status)}</Badge>
          )}
          {isStuck(r) && <StatusChip kind="flag" label="Kẹt" />}
          {r.attempts > 0 && (
            <span className="text-xs text-muted-foreground">{r.attempts} lần thử</span>
          )}
        </div>
      ),
    },
    {
      key: "created_at",
      header: "Tạo lúc",
      cell: (r) => formatUtcDateTime(r.created_at),
      sortValue: (r) => r.created_at,
    },
    {
      key: "error",
      header: "Lỗi gần nhất",
      cell: (r) => r.last_error ?? "—",
    },
    {
      key: "actions",
      header: "",
      className: "w-24 text-right",
      cell: (r) =>
        r.status !== "sent" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate(r.id)}
          >
            Gửi lại
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Nhật ký gửi</h2>
          <p className="text-sm text-muted-foreground">500 email gần nhất — lọc theo trạng thái, gửi lại email lỗi.</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? ALL)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            <SelectItem value="queued">{emailOutboxStatusLabel("queued")}</SelectItem>
            <SelectItem value="sending">{emailOutboxStatusLabel("sending")}</SelectItem>
            <SelectItem value="sent">{emailOutboxStatusLabel("sent")}</SelectItem>
            <SelectItem value="failed">{emailOutboxStatusLabel("failed")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        emptyMessage="Chưa có email nào trong nhật ký."
      />
    </div>
  );
}
