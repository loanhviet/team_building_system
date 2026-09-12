"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { apiDownload, apiFetch, apiUpload, ApiError } from "@/lib/api";
import type { Hotel, ImportResult, Room, RoomAssignment, UnassignedEmployee } from "@/types/api";

export function HotelRoomsPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const [hotelDialogOpen, setHotelDialogOpen] = useState(false);
  const [hotelName, setHotelName] = useState("");
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null);
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomCapacity, setRoomCapacity] = useState("2");
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignRoomId, setAssignRoomId] = useState("");
  const roomImportRef = useRef<HTMLInputElement>(null);
  const assignImportRef = useRef<HTMLInputElement>(null);

  const { data: hotels } = useQuery({
    queryKey: ["events", eventId, "hotels"],
    queryFn: () => apiFetch<Hotel[]>(`/api/events/${eventId}/hotels`),
  });

  const hotelId = selectedHotelId ?? hotels?.[0]?.id ?? null;

  const { data: rooms } = useQuery({
    queryKey: ["events", eventId, "hotels", hotelId, "rooms"],
    queryFn: () => apiFetch<Room[]>(`/api/events/${eventId}/hotels/${hotelId}/rooms`),
    enabled: !!hotelId,
  });

  const { data: unassigned } = useQuery({
    queryKey: ["events", eventId, "room-assignments", "unassigned"],
    queryFn: () =>
      apiFetch<UnassignedEmployee[]>(`/api/events/${eventId}/room-assignments/unassigned`),
  });

  const { data: assignments } = useQuery({
    queryKey: ["events", eventId, "room-assignments"],
    queryFn: () => apiFetch<RoomAssignment[]>(`/api/events/${eventId}/room-assignments`),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "hotels"] });
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "room-assignments"] });
  };

  const createHotelMutation = useMutation({
    mutationFn: () =>
      apiFetch<Hotel>(`/api/events/${eventId}/hotels`, {
        method: "POST",
        body: JSON.stringify({ name: hotelName }),
      }),
    onSuccess: () => {
      toast.success("Đã thêm khách sạn");
      setHotelDialogOpen(false);
      setHotelName("");
      invalidateAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const createRoomMutation = useMutation({
    mutationFn: () =>
      apiFetch<Room>(`/api/events/${eventId}/hotels/${hotelId}/rooms`, {
        method: "POST",
        body: JSON.stringify({ room_number: roomNumber, capacity: Number(roomCapacity) }),
      }),
    onSuccess: () => {
      toast.success("Đã thêm phòng");
      setRoomDialogOpen(false);
      setRoomNumber("");
      setRoomCapacity("2");
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "hotels", hotelId, "rooms"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const importRoomsMutation = useMutation({
    mutationFn: (file: File) =>
      apiUpload<ImportResult>(`/api/events/${eventId}/hotels/${hotelId}/rooms/import`, file),
    onSuccess: (result) => {
      toast.success(`Import xong: ${result.ok_rows} OK, ${result.error_rows} lỗi`);
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "hotels", hotelId, "rooms"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import thất bại"),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/events/${eventId}/room-assignments/assign`, {
        method: "POST",
        body: JSON.stringify({ employee_id: Number(assignEmployeeId), room_id: Number(assignRoomId) }),
      }),
    onSuccess: () => {
      toast.success("Đã gán phòng");
      setAssignEmployeeId("");
      setAssignRoomId("");
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "hotels", hotelId, "rooms"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const importAssignmentsMutation = useMutation({
    mutationFn: (file: File) =>
      apiUpload<ImportResult>(`/api/events/${eventId}/room-assignments/import`, file),
    onSuccess: (result) => {
      toast.success(`Import xong: ${result.ok_rows} OK, ${result.error_rows} lỗi`);
      invalidateAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import thất bại"),
  });

  const allRooms = rooms ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Select
          value={hotelId ? String(hotelId) : undefined}
          onValueChange={(v) => setSelectedHotelId(Number(v))}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Chọn khách sạn" />
          </SelectTrigger>
          <SelectContent>
            {hotels?.map((h) => (
              <SelectItem key={h.id} value={String(h.id)}>
                {h.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={hotelDialogOpen} onOpenChange={setHotelDialogOpen}>
          <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
            Thêm khách sạn
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Thêm khách sạn</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hotel-name">Tên khách sạn</Label>
              <Input id="hotel-name" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
            </div>
            <DialogFooter>
              <Button
                disabled={!hotelName || createHotelMutation.isPending}
                onClick={() => createHotelMutation.mutate()}
              >
                Lưu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {hotelId && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Phòng</p>
            <div className="ml-auto flex gap-2">
              <input
                ref={roomImportRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importRoomsMutation.mutate(file);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  apiDownload(
                    `/api/events/${eventId}/hotels/${hotelId}/rooms/import-template`,
                    `rooms_template_hotel_${hotelId}.xlsx`,
                  ).catch((err) => toast.error(err instanceof ApiError ? err.message : "Tải file thất bại"))
                }
              >
                File mẫu phòng
              </Button>
              <Button variant="outline" size="sm" onClick={() => roomImportRef.current?.click()}>
                Import phòng
              </Button>
              <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
                <DialogTrigger className={buttonVariants({ size: "sm" })}>Thêm phòng</DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Thêm phòng</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="room-number">Số phòng</Label>
                      <Input
                        id="room-number"
                        value={roomNumber}
                        onChange={(e) => setRoomNumber(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="room-capacity">Sức chứa</Label>
                      <Input
                        id="room-capacity"
                        type="number"
                        value={roomCapacity}
                        onChange={(e) => setRoomCapacity(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      disabled={!roomNumber || createRoomMutation.isPending}
                      onClick={() => createRoomMutation.mutate()}
                    >
                      Lưu
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Số phòng</TableHead>
                <TableHead>Sức chứa</TableHead>
                <TableHead>Đã ở</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allRooms.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.room_number}</TableCell>
                  <TableCell>{r.capacity}</TableCell>
                  <TableCell>
                    <Badge variant={r.occupied >= r.capacity ? "secondary" : "outline"}>
                      {r.occupied}/{r.capacity}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {allRooms.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Chưa có phòng
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Phân phòng</p>
          <div className="ml-auto flex gap-2">
            <input
              ref={assignImportRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importAssignmentsMutation.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                apiDownload(
                  `/api/events/${eventId}/room-assignments/import-template`,
                  `room_assignments_template_event_${eventId}.xlsx`,
                ).catch((err) => toast.error(err instanceof ApiError ? err.message : "Tải file thất bại"))
              }
            >
              File mẫu phân phòng
            </Button>
            <Button variant="outline" size="sm" onClick={() => assignImportRef.current?.click()}>
              Import phân phòng
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                apiDownload(
                  `/api/events/${eventId}/room-assignments/export`,
                  `room_assignments_event_${eventId}.xlsx`,
                ).catch((err) =>
                  toast.error(err instanceof ApiError ? err.message : "Tải file thất bại"),
                )
              }
            >
              Export Excel
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={assignEmployeeId} onValueChange={(v) => setAssignEmployeeId(v ?? "")}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Chọn CBNV chưa có phòng" />
            </SelectTrigger>
            <SelectContent>
              {unassigned?.map((e) => (
                <SelectItem key={e.employee_id} value={String(e.employee_id)}>
                  {e.employee_code} — {e.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignRoomId} onValueChange={(v) => setAssignRoomId(v ?? "")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Chọn phòng" />
            </SelectTrigger>
            <SelectContent>
              {allRooms.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.room_number} ({r.occupied}/{r.capacity})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!assignEmployeeId || !assignRoomId || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
          >
            Gán phòng
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã NV</TableHead>
              <TableHead>Họ tên</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Khách sạn</TableHead>
              <TableHead>Phòng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments?.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono">{a.employee_code ?? "—"}</TableCell>
                <TableCell>{a.full_name}</TableCell>
                <TableCell>{a.team_name ?? "—"}</TableCell>
                <TableCell>{a.hotel_name}</TableCell>
                <TableCell>{a.room_number}</TableCell>
              </TableRow>
            ))}
            {(!assignments || assignments.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Chưa gán phòng cho ai
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
