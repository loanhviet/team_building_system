"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { FormField, MoreFields } from "@/components/domain/form-field";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { StatusChip } from "@/components/domain/status-chip";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiDownload, apiFetch, apiUpload, ApiError } from "@/lib/api";
import type { Hotel, ImportResult, Room, RoomAssignment, RoomType, UnassignedEmployee } from "@/types/api";

const EMPTY_HOTEL = { name: "", address: "", checkin_date: "", checkout_date: "", note: "" };
const EMPTY_ROOM_TYPE = { name: "", capacity: "2", quantity: "0" };
const EMPTY_ROOM = { room_number: "", room_type_id: "", capacity: "2", note: "" };

export function HotelRoomsPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const [hotelDialogOpen, setHotelDialogOpen] = useState(false);
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null);
  const [hotelForm, setHotelForm] = useState(EMPTY_HOTEL);
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null);

  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<RoomType | null>(null);
  const [typeForm, setTypeForm] = useState(EMPTY_ROOM_TYPE);

  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM);

  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignRoomId, setAssignRoomId] = useState("");
  const roomImportRef = useRef<HTMLInputElement>(null);
  const assignImportRef = useRef<HTMLInputElement>(null);

  const { data: hotels } = useQuery({
    queryKey: ["events", eventId, "hotels"],
    queryFn: () => apiFetch<Hotel[]>(`/api/events/${eventId}/hotels`),
  });

  const hotelId = selectedHotelId ?? hotels?.[0]?.id ?? null;
  const currentHotel = hotels?.find((h) => h.id === hotelId) ?? null;

  const { data: roomTypes } = useQuery({
    queryKey: ["events", eventId, "hotels", hotelId, "room-types"],
    queryFn: () => apiFetch<RoomType[]>(`/api/events/${eventId}/hotels/${hotelId}/room-types`),
    enabled: !!hotelId,
  });

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
  const invalidateRooms = () =>
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "hotels", hotelId, "rooms"] });
  const invalidateTypes = () =>
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "hotels", hotelId, "room-types"] });

  const openCreateHotel = () => {
    setEditingHotel(null);
    setHotelForm(EMPTY_HOTEL);
    setHotelDialogOpen(true);
  };
  const openEditHotel = (hotel: Hotel) => {
    setEditingHotel(hotel);
    setHotelForm({
      name: hotel.name,
      address: hotel.address ?? "",
      checkin_date: hotel.checkin_date ?? "",
      checkout_date: hotel.checkout_date ?? "",
      note: hotel.note ?? "",
    });
    setHotelDialogOpen(true);
  };

  const saveHotelMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: hotelForm.name,
        address: hotelForm.address || null,
        checkin_date: hotelForm.checkin_date || null,
        checkout_date: hotelForm.checkout_date || null,
        note: hotelForm.note || null,
      };
      return editingHotel
        ? apiFetch<Hotel>(`/api/events/${eventId}/hotels/${editingHotel.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : apiFetch<Hotel>(`/api/events/${eventId}/hotels`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
    },
    onSuccess: () => {
      toast.success(editingHotel ? "Đã cập nhật khách sạn" : "Đã thêm khách sạn");
      setHotelDialogOpen(false);
      invalidateAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const openCreateType = () => {
    setEditingType(null);
    setTypeForm(EMPTY_ROOM_TYPE);
    setTypeDialogOpen(true);
  };
  const openEditType = (t: RoomType) => {
    setEditingType(t);
    setTypeForm({ name: t.name, capacity: String(t.capacity), quantity: String(t.quantity) });
    setTypeDialogOpen(true);
  };

  const saveTypeMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: typeForm.name,
        capacity: Number(typeForm.capacity),
        quantity: Number(typeForm.quantity),
      };
      return editingType
        ? apiFetch<RoomType>(`/api/events/${eventId}/hotels/${hotelId}/room-types/${editingType.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : apiFetch<RoomType>(`/api/events/${eventId}/hotels/${hotelId}/room-types`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
    },
    onSuccess: () => {
      toast.success(editingType ? "Đã cập nhật loại phòng" : "Đã thêm loại phòng");
      setTypeDialogOpen(false);
      invalidateTypes();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/events/${eventId}/hotels/${hotelId}/room-types/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Đã xoá loại phòng");
      invalidateTypes();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const openCreateRoom = () => {
    setEditingRoom(null);
    setRoomForm(EMPTY_ROOM);
    setRoomDialogOpen(true);
  };
  const openEditRoom = (r: Room) => {
    setEditingRoom(r);
    setRoomForm({
      room_number: r.room_number,
      room_type_id: r.room_type_id ? String(r.room_type_id) : "",
      capacity: String(r.capacity),
      note: r.note ?? "",
    });
    setRoomDialogOpen(true);
  };

  const saveRoomMutation = useMutation({
    mutationFn: () => {
      const payload = {
        room_number: roomForm.room_number,
        room_type_id: roomForm.room_type_id ? Number(roomForm.room_type_id) : null,
        capacity: Number(roomForm.capacity),
        note: roomForm.note || null,
      };
      return editingRoom
        ? apiFetch<Room>(`/api/events/${eventId}/hotels/${hotelId}/rooms/${editingRoom.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : apiFetch<Room>(`/api/events/${eventId}/hotels/${hotelId}/rooms`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
    },
    onSuccess: () => {
      toast.success(editingRoom ? "Đã cập nhật phòng" : "Đã thêm phòng");
      setRoomDialogOpen(false);
      invalidateRooms();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const deleteRoomMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/events/${eventId}/hotels/${hotelId}/rooms/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Đã xoá phòng");
      invalidateRooms();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const importRoomsMutation = useMutation({
    mutationFn: (file: File) =>
      apiUpload<ImportResult>(`/api/events/${eventId}/hotels/${hotelId}/rooms/import`, file),
    onSuccess: (result) => {
      toast.success(`Import xong: ${result.ok_rows} OK, ${result.error_rows} lỗi`);
      invalidateRooms();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import thất bại"),
  });

  const assignMutation = useMutation({
    mutationFn: (vars: { employeeId: number; roomId: number }) =>
      apiFetch(`/api/events/${eventId}/room-assignments/assign`, {
        method: "POST",
        body: JSON.stringify({ employee_id: vars.employeeId, room_id: vars.roomId }),
      }),
    onSuccess: () => {
      toast.success("Đã gán phòng");
      setAssignEmployeeId("");
      setAssignRoomId("");
      invalidateAll();
      invalidateRooms();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const unassignMutation = useMutation({
    mutationFn: (assignmentId: number) =>
      apiFetch(`/api/events/${eventId}/room-assignments/${assignmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Đã bỏ gán phòng");
      invalidateAll();
      invalidateRooms();
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
  const allAssignments = assignments ?? [];

  // Anyone eligible to (re)assign: registered participants with no room yet,
  // plus everyone already assigned somewhere (so a wrong room can be fixed
  // without dropping them first) — union of the two lists the backend gives us.
  const assignableEmployees = [
    ...(unassigned ?? []).map((e) => ({ employee_id: e.employee_id, employee_code: e.employee_code, full_name: e.full_name })),
    ...allAssignments.map((a) => ({ employee_id: a.employee_id, employee_code: a.employee_code, full_name: a.full_name })),
  ];

  const typeColumns: DataTableColumn<RoomType>[] = [
    { key: "name", header: "Tên loại", cell: (t) => t.name },
    { key: "capacity", header: "Sức chứa/phòng", cell: (t) => t.capacity },
    { key: "quantity", header: "Số phòng dự kiến", cell: (t) => t.quantity },
    {
      key: "actions",
      header: "",
      cell: (t) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => openEditType(t)}>
            Sửa
          </Button>
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="ghost">
                Xoá
              </Button>
            }
            title="Xoá loại phòng này?"
            description="Chỉ xoá được khi không còn phòng nào dùng loại này."
            confirmLabel="Xoá"
            destructive
            onConfirm={() => deleteTypeMutation.mutate(t.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4">
        <div className="mr-auto">
          <h2 className="font-display text-lg font-semibold">Phòng khách sạn</h2>
          <p className="text-sm text-muted-foreground">Import danh sách phòng hoặc gán thủ công. CBNV chỉ xem sau khi công bố.</p>
        </div>
        <Select
          value={hotelId ? String(hotelId) : undefined}
          onValueChange={(v) => setSelectedHotelId(Number(v))}
        >
          <SelectTrigger className="min-h-11 w-64">
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
        {currentHotel && (
          <Button variant="ghost" size="sm" onClick={() => openEditHotel(currentHotel)}>
            Sửa khách sạn
          </Button>
        )}
        <Dialog open={hotelDialogOpen} onOpenChange={setHotelDialogOpen}>
          <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })} onClick={openCreateHotel}>
            Thêm khách sạn
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingHotel ? "Sửa khách sạn" : "Thêm khách sạn"}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <FormField label="Tên khách sạn" required>
                <Input value={hotelForm.name} onChange={(e) => setHotelForm({ ...hotelForm, name: e.target.value })} />
              </FormField>
              <MoreFields>
                <FormField label="Địa chỉ" className="sm:col-span-2">
                  <Input value={hotelForm.address} onChange={(e) => setHotelForm({ ...hotelForm, address: e.target.value })} />
                </FormField>
                <FormField label="Nhận phòng">
                  <Input type="date" value={hotelForm.checkin_date} onChange={(e) => setHotelForm({ ...hotelForm, checkin_date: e.target.value })} />
                </FormField>
                <FormField label="Trả phòng">
                  <Input type="date" value={hotelForm.checkout_date} onChange={(e) => setHotelForm({ ...hotelForm, checkout_date: e.target.value })} />
                </FormField>
                <FormField label="Ghi chú" className="sm:col-span-2">
                  <Input value={hotelForm.note} onChange={(e) => setHotelForm({ ...hotelForm, note: e.target.value })} />
                </FormField>
              </MoreFields>
            </div>
            <DialogFooter>
              <Button disabled={!hotelForm.name || saveHotelMutation.isPending} onClick={() => saveHotelMutation.mutate()}>
                Lưu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {hotelId && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Loại phòng</p>
              <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
                <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm", className: "ml-auto" })} onClick={openCreateType}>
                  Thêm loại phòng
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingType ? "Sửa loại phòng" : "Thêm loại phòng"}</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Tên loại</Label>
                      <Input value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Sức chứa/phòng</Label>
                      <Input type="number" value={typeForm.capacity} onChange={(e) => setTypeForm({ ...typeForm, capacity: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Số phòng dự kiến</Label>
                      <Input type="number" value={typeForm.quantity} onChange={(e) => setTypeForm({ ...typeForm, quantity: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button disabled={!typeForm.name || saveTypeMutation.isPending} onClick={() => saveTypeMutation.mutate()}>
                      Lưu
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <DataTable columns={typeColumns} rows={roomTypes ?? []} rowKey={(t) => t.id} emptyMessage="Chưa có loại phòng" />
          </div>

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
                  <DialogTrigger className={buttonVariants({ size: "sm" })} onClick={openCreateRoom}>
                    Thêm phòng
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingRoom ? "Sửa phòng" : "Thêm phòng"}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <Label>Số phòng</Label>
                        <Input value={roomForm.room_number} onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Loại phòng</Label>
                        <Select value={roomForm.room_type_id} onValueChange={(v) => setRoomForm({ ...roomForm, room_type_id: v ?? "" })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn loại phòng" />
                          </SelectTrigger>
                          <SelectContent>
                            {roomTypes?.map((t) => (
                              <SelectItem key={t.id} value={String(t.id)}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Sức chứa</Label>
                        <Input type="number" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Ghi chú</Label>
                        <Input value={roomForm.note} onChange={(e) => setRoomForm({ ...roomForm, note: e.target.value })} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button disabled={!roomForm.room_number || saveRoomMutation.isPending} onClick={() => saveRoomMutation.mutate()}>
                        Lưu
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            {allRooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có phòng.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {allRooms.map((r) => {
                  const guests = allAssignments.filter((a) => a.room_id === r.id);
                  const full = r.occupied >= r.capacity;
                  return (
                    <div
                      key={r.id}
                      className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-display text-lg font-semibold">Phòng {r.room_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {roomTypes?.find((t) => t.id === r.room_type_id)?.name ?? "Phòng"} · {r.occupied}/{r.capacity}
                            {full ? " · đầy" : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => openEditRoom(r)}>
                            Sửa
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" className="h-8 px-2 text-xs">
                                Xoá
                              </Button>
                            }
                            title="Xoá phòng này?"
                            description="Chỉ xoá được khi không còn ai đang ở phòng này."
                            confirmLabel="Xoá"
                            destructive
                            onConfirm={() => deleteRoomMutation.mutate(r.id)}
                          />
                        </div>
                      </div>
                      {guests.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Trống</p>
                      ) : (
                        <ul className="flex flex-col gap-1 text-sm">
                          {guests.map((g) => (
                            <li key={g.id} className="flex items-center justify-between gap-2">
                              <span className="truncate">{g.full_name}</span>
                              <ConfirmDialog
                                trigger={
                                  <Button variant="ghost" className="h-8 px-2 text-xs">
                                    Bỏ
                                  </Button>
                                }
                                title="Bỏ gán phòng?"
                                description={`${g.full_name} sẽ trở lại danh sách chưa có phòng.`}
                                confirmLabel="Bỏ gán"
                                destructive
                                onConfirm={() => unassignMutation.mutate(g.id)}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {(unassigned?.length ?? 0) > 0 && (
        <StatusChip kind="flag" label={`${unassigned!.length} người tham gia chưa có phòng`} />
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
                ).catch((err) =>
                  toast.error(err instanceof ApiError ? err.message : "Tải file thất bại"),
                )
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
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Chọn CBNV (gán hoặc đổi phòng)" />
            </SelectTrigger>
            <SelectContent>
              {assignableEmployees.map((e) => (
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
            onClick={() =>
              assignMutation.mutate({ employeeId: Number(assignEmployeeId), roomId: Number(assignRoomId) })
            }
          >
            Gán / đổi phòng
          </Button>
        </div>

        {(unassigned?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {unassigned!.slice(0, 12).map((e) => (
              <li key={e.employee_id}>
                {e.employee_code} — {e.full_name}
              </li>
            ))}
            {(unassigned?.length ?? 0) > 12 && <li>… và {(unassigned!.length) - 12} người nữa</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
