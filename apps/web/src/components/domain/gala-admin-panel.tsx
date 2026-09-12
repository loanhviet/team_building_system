"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { GalaConfig, GalaState, GalaTable, GalaTurn } from "@/types/api";

export function GalaAdminPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);
  const [name, setName] = useState("Gala Dinner");
  const [turnDuration, setTurnDuration] = useState("60");
  const [holdTtl, setHoldTtl] = useState("30");
  const [tableOpen, setTableOpen] = useState(false);
  const [tableCode, setTableCode] = useState("");
  const [tableSeatCount, setTableSeatCount] = useState("8");
  const [tableX, setTableX] = useState("0");
  const [tableY, setTableY] = useState("0");

  const { data: state } = useQuery({
    queryKey: ["events", eventId, "gala", "state"],
    queryFn: () => apiFetch<GalaState>(`/api/events/${eventId}/gala/state`),
  });

  const saveConfigMutation = useMutation({
    mutationFn: () =>
      apiFetch<GalaConfig>(`/api/events/${eventId}/gala/config`, {
        method: "PUT",
        body: JSON.stringify({
          name, turn_duration_seconds: Number(turnDuration), hold_ttl_seconds: Number(holdTtl),
        }),
      }),
    onSuccess: () => {
      toast.success("Đã lưu cấu hình Gala");
      setConfigOpen(false);
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "gala", "state"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const createTableMutation = useMutation({
    mutationFn: () =>
      apiFetch<GalaTable>(`/api/events/${eventId}/gala/tables`, {
        method: "POST",
        body: JSON.stringify({
          code: tableCode, seat_count: Number(tableSeatCount),
          x: Number(tableX), y: Number(tableY),
        }),
      }),
    onSuccess: () => {
      toast.success("Đã thêm bàn");
      setTableOpen(false);
      setTableCode("");
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "gala", "state"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const drawMutation = useMutation({
    mutationFn: () => apiFetch<GalaTurn[]>(`/api/events/${eventId}/gala/draw`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Đã bốc thăm thứ tự Team");
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "gala", "state"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={configOpen} onOpenChange={setConfigOpen}>
          <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
            {state?.config ? "Sửa cấu hình" : "Tạo cấu hình Gala"}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cấu hình Gala Dinner</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="gala-name">Tên</Label>
                <Input id="gala-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="turn-duration">Thời gian mỗi lượt (giây)</Label>
                <Input
                  id="turn-duration"
                  type="number"
                  value={turnDuration}
                  onChange={(e) => setTurnDuration(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="hold-ttl">Thời gian giữ ghế (giây)</Label>
                <Input
                  id="hold-ttl"
                  type="number"
                  value={holdTtl}
                  onChange={(e) => setHoldTtl(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!name || saveConfigMutation.isPending} onClick={() => saveConfigMutation.mutate()}>
                Lưu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={tableOpen} onOpenChange={setTableOpen}>
          <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
            Thêm bàn
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Thêm bàn</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="table-code">Mã bàn</Label>
                <Input id="table-code" value={tableCode} onChange={(e) => setTableCode(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="table-seats">Số ghế</Label>
                <Input
                  id="table-seats"
                  type="number"
                  value={tableSeatCount}
                  onChange={(e) => setTableSeatCount(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="table-x">Vị trí X</Label>
                  <Input id="table-x" type="number" value={tableX} onChange={(e) => setTableX(e.target.value)} />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="table-y">Vị trí Y</Label>
                  <Input id="table-y" type="number" value={tableY} onChange={(e) => setTableY(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!tableCode || createTableMutation.isPending} onClick={() => createTableMutation.mutate()}>
                Lưu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          size="sm"
          disabled={!state?.config || (state.turns.length > 0) || drawMutation.isPending}
          onClick={() => drawMutation.mutate()}
        >
          Bốc thăm thứ tự Team
        </Button>

        <Link href={`/gala/${eventId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Mở sơ đồ Gala
        </Link>
      </div>

      {state?.config && (
        <p className="text-sm text-zinc-500">
          Trạng thái: <Badge variant="outline">{state.config.status}</Badge> — {state.tables.length} bàn,{" "}
          {state.seats.length} ghế
        </p>
      )}

      {state && state.turns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thứ tự bốc thăm</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {state.turns.map((t) => (
              <Badge
                key={t.id}
                variant={t.status === "active" ? "default" : "outline"}
                className={t.status === "done" ? "opacity-50" : undefined}
              >
                #{t.order_no} {t.team_name} ({t.seat_quota} ghế) — {t.status}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
