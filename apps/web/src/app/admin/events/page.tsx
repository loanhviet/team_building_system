"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { PageHeader } from "@/components/domain/page-header";
import { EventStatusBadge } from "@/components/domain/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api";
import { EVENT_STATUS_LABELS } from "@/lib/event-status";
import type { Event } from "@/types/api";

export default function EventsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch<Event[]>("/api/events"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<Event>("/api/events", {
        method: "POST",
        body: JSON.stringify({ code, name, destination: destination || null }),
      }),
    onSuccess: (event) => {
      toast.success("Đã tạo sự kiện");
      setOpen(false);
      setCode("");
      setName("");
      setDestination("");
      queryClient.invalidateQueries({ queryKey: ["events"] });
      router.push(`/admin/events/${event.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const columns: DataTableColumn<Event>[] = [
    {
      key: "code",
      header: "Mã",
      cell: (e) => (
        <Link href={`/admin/events/${e.id}`} className="font-mono hover:underline">
          {e.code}
        </Link>
      ),
      sortValue: (e) => e.code,
    },
    {
      key: "name",
      header: "Tên",
      cell: (e) => (
        <Link href={`/admin/events/${e.id}`} className="hover:underline">
          {e.name}
        </Link>
      ),
      sortValue: (e) => e.name,
    },
    { key: "destination", header: "Điểm đến", cell: (e) => e.destination ?? "—", sortValue: (e) => e.destination },
    {
      key: "status",
      header: "Trạng thái",
      cell: (e) => <EventStatusBadge status={e.status} />,
      sortValue: (e) => EVENT_STATUS_LABELS[e.status],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Sự kiện" description="Các kỳ Team Building." />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className={buttonVariants()}>Tạo sự kiện</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tạo sự kiện mới</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-code">Mã sự kiện</Label>
                <Input id="event-code" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-name">Tên sự kiện</Label>
                <Input id="event-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-destination">Điểm đến</Label>
                <Input
                  id="event-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!code || !name || createMutation.isPending}
              >
                Tạo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        emptyMessage="Chưa có sự kiện. Tạo kỳ Team Building đầu tiên để bắt đầu."
      />
    </div>
  );
}
