"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sự kiện</h1>
          <p className="text-sm text-zinc-500">Các kỳ Team Building trong hệ thống.</p>
        </div>
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã</TableHead>
            <TableHead>Tên</TableHead>
            <TableHead>Điểm đến</TableHead>
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-zinc-500">
                Đang tải...
              </TableCell>
            </TableRow>
          )}
          {data?.map((event) => (
            <TableRow key={event.id} className="cursor-pointer">
              <TableCell className="font-mono">
                <Link href={`/admin/events/${event.id}`} className="hover:underline">
                  {event.code}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/admin/events/${event.id}`} className="hover:underline">
                  {event.name}
                </Link>
              </TableCell>
              <TableCell>{event.destination ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline">{EVENT_STATUS_LABELS[event.status]}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
