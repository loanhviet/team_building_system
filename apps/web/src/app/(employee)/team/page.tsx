"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { EmptyState } from "@/components/domain/empty-state";
import { PageHeader } from "@/components/domain/page-header";
import { PageSkeleton } from "@/components/domain/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useEmployeeEvent } from "@/lib/use-employee-event";
import { cn } from "@/lib/utils";
import type { GalaConfig, TeamRoster } from "@/types/api";

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  submitted: "Đã gửi",
  cancelled: "Đã huỷ",
};

type Member = TeamRoster["members"][number];

export default function TeamPage() {
  const { user } = useAuth();
  const { eventId, eventName, isLeader } = useEmployeeEvent();
  const [search, setSearch] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["events", eventId, "team", "roster"],
    queryFn: () => apiFetch<TeamRoster>(`/api/events/${eventId}/team/roster`),
    enabled: !!eventId && isLeader,
    retry: false,
  });

  const { data: galaConfig } = useQuery({
    queryKey: ["events", eventId, "gala", "config"],
    queryFn: () => apiFetch<GalaConfig | null>(`/api/events/${eventId}/gala/config`),
    enabled: !!eventId && isLeader,
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

  if (isLoading) return <PageSkeleton />;

  if (error) {
    return (
      <EmptyState
        variant="error"
        title="Không tải được danh sách Team"
        description={error instanceof ApiError ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data) {
    return <EmptyState title="Chưa có dữ liệu Team" />;
  }

  const submitted = data.members.filter((m) => m.registration_status === "submitted").length;
  const canPickGalaSeats = !!galaConfig && galaConfig.status !== "setup";
  const filtered = search
    ? data.members.filter((m) =>
        `${m.full_name} ${m.employee_code ?? ""}`.toLowerCase().includes(search.toLowerCase()),
      )
    : data.members;

  const columns: DataTableColumn<Member>[] = [
    {
      key: "employee_code",
      header: "Mã NV",
      cell: (m) => <span className="font-mono text-xs">{m.employee_code ?? "—"}</span>,
      sortValue: (m) => m.employee_code ?? "",
    },
    { key: "full_name", header: "Họ tên", cell: (m) => m.full_name, sortValue: (m) => m.full_name },
    { key: "email", header: "Email", cell: (m) => m.email },
    { key: "phone", header: "SĐT", cell: (m) => m.phone ?? "—" },
    {
      key: "registration_status",
      header: "Đăng ký",
      cell: (m) => (
        <Badge variant="outline">
          {m.registration_status ? STATUS_LABEL[m.registration_status] : "Chưa đăng ký"}
        </Badge>
      ),
    },
    {
      key: "is_participating",
      header: "Tham gia",
      cell: (m) => (m.is_participating == null ? "—" : m.is_participating ? "Có" : "Không"),
    },
    { key: "shift_name", header: "Ca", cell: (m) => m.shift_name ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={data.team_name}
        description={`${eventName ? `${eventName} · ` : ""}${submitted}/${data.members.length} thành viên đã gửi đăng ký`}
        actions={
          canPickGalaSeats ? (
            <Link href={`/gala/${eventId}`} className={cn(buttonVariants(), "min-h-11")}>
              Chọn ghế Gala
            </Link>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(m) => m.employee_id}
        emptyMessage="Không có thành viên nào khớp tìm kiếm"
        toolbar={
          <Input
            placeholder="Tìm theo tên, mã NV..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        }
      />
    </div>
  );
}
