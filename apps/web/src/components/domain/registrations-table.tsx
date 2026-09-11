"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDownload, apiFetch, ApiError } from "@/lib/api";
import type { RegistrationAdmin } from "@/types/api";

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  submitted: "Đã gửi",
  cancelled: "Đã huỷ",
};

export function RegistrationsTable({ eventId }: { eventId: number }) {
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["events", eventId, "registrations", { search }],
    queryFn: () =>
      apiFetch<RegistrationAdmin[]>(
        `/api/events/${eventId}/registrations${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      ),
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
      <div className="flex items-center justify-between gap-2">
        <Input
          placeholder="Tìm theo tên, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
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
            <TableHead>Mong muốn</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-zinc-500">
                Đang tải...
              </TableCell>
            </TableRow>
          )}
          {!isLoading && data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-zinc-500">
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
              <TableCell className="max-w-xs truncate">{reg.wish_note ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
