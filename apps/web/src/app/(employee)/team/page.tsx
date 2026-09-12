"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useEmployeeEvent } from "@/lib/use-employee-event";
import type { TeamRoster } from "@/types/api";

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  submitted: "Đã gửi",
  cancelled: "Đã huỷ",
};

export default function TeamPage() {
  const { user } = useAuth();
  const { eventId, eventName, isLeader } = useEmployeeEvent();

  const { data, isLoading, error } = useQuery({
    queryKey: ["events", eventId, "team", "roster"],
    queryFn: () => apiFetch<TeamRoster>(`/api/events/${eventId}/team/roster`),
    enabled: !!eventId && isLeader,
    retry: false,
  });

  if (user && !isLeader) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-display text-2xl">Trang dành cho Trưởng nhóm</h1>
        <p className="mt-2 text-sm text-muted-foreground">Bạn không có quyền xem danh sách Team.</p>
      </div>
    );
  }

  if (!eventId) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Chưa có sự kiện để xem danh sách Team.
      </p>
    );
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải danh sách Team...</p>;

  if (error) {
    return (
      <p className="text-sm text-red-600">
        {error instanceof ApiError ? error.message : "Không tải được danh sách"}
      </p>
    );
  }

  if (!data) return null;

  const submitted = data.members.filter((m) => m.registration_status === "submitted").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ticket-kicker">{eventName}</p>
          <h1 className="font-display text-3xl font-semibold">{data.team_name}</h1>
          <p className="text-sm text-muted-foreground">
            {submitted}/{data.members.length} thành viên đã gửi đăng ký
          </p>
        </div>
        <Link href={`/gala/${eventId}`} className={buttonVariants()}>
          Chọn ghế Gala
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã NV</TableHead>
            <TableHead>Họ tên</TableHead>
            <TableHead>Đăng ký</TableHead>
            <TableHead>Tham gia</TableHead>
            <TableHead>Ca</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.members.map((m) => (
            <TableRow key={m.employee_id}>
              <TableCell className="font-mono text-xs">{m.employee_code ?? "—"}</TableCell>
              <TableCell>{m.full_name}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {m.registration_status ? STATUS_LABEL[m.registration_status] : "Chưa đăng ký"}
                </Badge>
              </TableCell>
              <TableCell>
                {m.is_participating == null ? "—" : m.is_participating ? "Có" : "Không"}
              </TableCell>
              <TableCell>{m.shift_name ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
