"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { AllocationKpiStrip } from "@/components/domain/allocation-workbench";
import { FormField } from "@/components/domain/form-field";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiDownload, apiFetch, apiUpload, ApiError } from "@/lib/api";
import type { Event, Hotel, ImportResult, Room, RoomAssignment, RoomType, UnassignedEmployee } from "@/types/api";

const EMPTY_HOTEL = { code: "", name: "", address: "", checkin_date: "", checkout_date: "", note: "" };
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
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState<"all" | "available" | "full">("available");
  const roomImportRef = useRef<HTMLInputElement>(null);
  const assignImportRef = useRef<HTMLInputElement>(null);

  const { data: hotels } = useQuery({
    queryKey: ["events", eventId, "hotels"],
    queryFn: () => apiFetch<Hotel[]>(`/api/events/${eventId}/hotels`),
  });
  const { data: event } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => apiFetch<Event>(`/api/events/${eventId}`),
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
      code: hotel.code,
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
        code: hotelForm.code.trim().toUpperCase(),
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
  const employeeQuery = employeeSearch.trim().toLowerCase();
  const visibleUnassigned = (unassigned ?? []).filter((employee) =>
    [employee.employee_code, employee.full_name, employee.team_name, employee.site_name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(employeeQuery),
  );
  const roomQuery = roomSearch.trim().toLowerCase();
  const visibleRooms = allRooms.filter((room) => {
    if (roomFilter === "available" && room.occupied >= room.capacity) return false;
    if (roomFilter === "full" && room.occupied < room.capacity) return false;
    return room.room_number.toLowerCase().includes(roomQuery);
  });
  const selectedRoom = allRooms.find((room) => String(room.id) === assignRoomId) ?? null;
  const selectedEmployee = assignableEmployees.find(
    (employee) => String(employee.employee_id) === assignEmployeeId,
  );
  const currentHotelAssignments = currentHotel
    ? allAssignments.filter((assignment) => assignment.hotel_code === currentHotel.code)
    : [];
  const totalCapacity = allRooms.reduce((sum, room) => sum + room.capacity, 0);
  const occupiedCapacity = allRooms.reduce((sum, room) => sum + room.occupied, 0);
  const typeQuantityMismatch = (roomTypes ?? []).filter(
    (type) => allRooms.filter((room) => room.room_type_id === type.id).length !== type.quantity,
  ).length;

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
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h2 className="font-display text-lg font-semibold">Workbench phân phòng</h2>
            <p className="text-sm text-muted-foreground">Chọn nhân sự bên trái, chọn phòng còn chỗ bên phải rồi xác nhận.</p>
          </div>
          <Select value={hotelId ? String(hotelId) : undefined} onValueChange={(v) => {
            setSelectedHotelId(Number(v));
            setAssignRoomId("");
          }}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Chọn khách sạn" /></SelectTrigger>
            <SelectContent>{hotels?.map((hotel) => (
              <SelectItem key={hotel.id} value={String(hotel.id)}>{hotel.code} · {hotel.name}</SelectItem>
            ))}</SelectContent>
          </Select>
          {currentHotel && <Button variant="ghost" size="sm" onClick={() => openEditHotel(currentHotel)}>Sửa khách sạn</Button>}
          <Dialog open={hotelDialogOpen} onOpenChange={setHotelDialogOpen}>
            <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })} onClick={openCreateHotel}>Thêm khách sạn</DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingHotel ? "Sửa khách sạn" : "Thêm khách sạn"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Mã khách sạn" required><Input value={hotelForm.code} onChange={(e) => setHotelForm({ ...hotelForm, code: e.target.value.toUpperCase() })} placeholder="VD: KS01" /></FormField>
                <FormField label="Tên khách sạn" required><Input value={hotelForm.name} onChange={(e) => setHotelForm({ ...hotelForm, name: e.target.value })} /></FormField>
                <FormField label="Địa chỉ" className="sm:col-span-2"><Input value={hotelForm.address} onChange={(e) => setHotelForm({ ...hotelForm, address: e.target.value })} /></FormField>
                <div className="sm:col-span-2 rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="mr-auto text-sm font-medium">Thời gian lưu trú</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => setHotelForm({ ...hotelForm, checkin_date: event?.start_date ?? "", checkout_date: event?.end_date ?? event?.start_date ?? "" })} disabled={!event?.start_date}>
                      Dùng lịch sự kiện
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <FormField label="Nhận phòng" hint="Mặc định theo ngày bắt đầu sự kiện."><Input type="date" value={hotelForm.checkin_date} onChange={(e) => setHotelForm({ ...hotelForm, checkin_date: e.target.value })} /></FormField>
                    <FormField label="Trả phòng" hint="Mặc định theo ngày kết thúc sự kiện."><Input min={hotelForm.checkin_date || undefined} type="date" value={hotelForm.checkout_date} onChange={(e) => setHotelForm({ ...hotelForm, checkout_date: e.target.value })} /></FormField>
                  </div>
                </div>
                <FormField label="Ghi chú" className="sm:col-span-2"><Input value={hotelForm.note} onChange={(e) => setHotelForm({ ...hotelForm, note: e.target.value })} /></FormField>
              </div>
              <DialogFooter><Button disabled={!hotelForm.code || !hotelForm.name || saveHotelMutation.isPending} onClick={() => saveHotelMutation.mutate()}>Lưu</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <input ref={assignImportRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0]; if (file) importAssignmentsMutation.mutate(file); e.target.value = "";
          }} />
          <Button variant="outline" size="sm" onClick={() => apiDownload(`/api/events/${eventId}/room-assignments/import-template`, `room_assignments_template_event_${eventId}.xlsx`).catch((err) => toast.error(err instanceof ApiError ? err.message : "Tải file thất bại"))}>File mẫu phân phòng</Button>
          <Button variant="outline" size="sm" onClick={() => assignImportRef.current?.click()}>Import phân phòng</Button>
          <Button variant="outline" size="sm" onClick={() => apiDownload(`/api/events/${eventId}/room-assignments/export`, `room_assignments_event_${eventId}.xlsx`).catch((err) => toast.error(err instanceof ApiError ? err.message : "Tải file thất bại"))}>Export Excel</Button>
        </div>
      </div>

      <AllocationKpiStrip items={[
        { label: "Đã phân sự kiện", value: allAssignments.length },
        { label: "Chưa có phòng", value: unassigned?.length ?? 0, tone: (unassigned?.length ?? 0) ? "danger" : "default" },
        { label: "Đang ở KS này", value: currentHotelAssignments.length },
        { label: "Chỗ còn lại", value: Math.max(0, totalCapacity - occupiedCapacity) },
        { label: "Lệch SL loại phòng", value: typeQuantityMismatch, tone: typeQuantityMismatch ? "warning" : "default" },
      ]} />

      {!hotelId ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Hãy thêm hoặc chọn khách sạn để bắt đầu.</p> : (
        <>
          <details className="rounded-xl border border-border bg-card p-3">
            <summary className="cursor-pointer text-sm font-medium">Cấu hình loại phòng ({roomTypes?.length ?? 0})</summary>
            <div className="mt-3 flex justify-end">
              <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
                <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })} onClick={openCreateType}>Thêm loại phòng</DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editingType ? "Sửa loại phòng" : "Thêm loại phòng"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3">
                    <FormField label="Tên loại" required><Input value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} /></FormField>
                    <FormField label="Sức chứa/phòng" required><Input min={1} type="number" value={typeForm.capacity} onChange={(e) => setTypeForm({ ...typeForm, capacity: e.target.value })} /></FormField>
                    <FormField label="Số phòng dự kiến"><Input min={0} type="number" value={typeForm.quantity} onChange={(e) => setTypeForm({ ...typeForm, quantity: e.target.value })} /></FormField>
                  </div>
                  <DialogFooter><Button disabled={!typeForm.name || saveTypeMutation.isPending} onClick={() => saveTypeMutation.mutate()}>Lưu</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="mt-2"><DataTable columns={typeColumns} rows={roomTypes ?? []} rowKey={(type) => type.id} emptyMessage="Chưa có loại phòng" pageSize={10} /></div>
          </details>

          <div className="grid min-h-[560px] gap-4 lg:grid-cols-[340px_1fr]">
            <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card">
              <div className="border-b border-border p-3">
                <div className="flex items-center justify-between"><h3 className="font-medium">Chưa có phòng</h3><span className="text-xs tabular-nums text-muted-foreground">{visibleUnassigned.length} người</span></div>
                <Input className="mt-2" value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} placeholder="Tìm tên hoặc mã nhân viên..." />
              </div>
              <div className="max-h-[520px] flex-1 overflow-y-auto p-2">
                {visibleUnassigned.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Không còn nhân sự phù hợp bộ lọc.</p> : visibleUnassigned.map((employee) => (
                  <button key={employee.employee_id} type="button" onClick={() => setAssignEmployeeId(String(employee.employee_id))} className={`mb-1 w-full rounded-xl border px-3 py-2 text-left transition-colors ${assignEmployeeId === String(employee.employee_id) ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"}`}>
                    <span className="block truncate text-sm font-medium">{employee.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[employee.employee_code, employee.team_name, employee.site_name].filter(Boolean).join(" · ") || "Chưa có mã"}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                <div className="mr-auto"><h3 className="font-medium">Sơ đồ phòng · {currentHotel?.code}</h3><p className="text-xs text-muted-foreground">{occupiedCapacity}/{totalCapacity} chỗ đã dùng</p></div>
                <Input className="w-40" value={roomSearch} onChange={(e) => setRoomSearch(e.target.value)} placeholder="Tìm số phòng..." />
                <Select value={roomFilter} onValueChange={(value) => setRoomFilter((value ?? "all") as typeof roomFilter)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="available">Còn chỗ</SelectItem><SelectItem value="full">Đã đầy</SelectItem><SelectItem value="all">Tất cả</SelectItem></SelectContent></Select>
                <input ref={roomImportRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importRoomsMutation.mutate(file); e.target.value = ""; }} />
                <Button variant="outline" size="sm" onClick={() => apiDownload(`/api/events/${eventId}/hotels/${hotelId}/rooms/import-template`, `rooms_template_hotel_${hotelId}.xlsx`).catch((err) => toast.error(err instanceof ApiError ? err.message : "Tải file thất bại"))}>File mẫu</Button>
                <Button variant="outline" size="sm" onClick={() => roomImportRef.current?.click()}>Import phòng</Button>
                <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
                  <DialogTrigger className={buttonVariants({ size: "sm" })} onClick={openCreateRoom}>Thêm phòng</DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{editingRoom ? "Sửa phòng" : "Thêm phòng"}</DialogTitle></DialogHeader>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField label="Số phòng" required><Input value={roomForm.room_number} onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })} /></FormField>
                      <FormField label="Sức chứa" required><Input min={1} type="number" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })} /></FormField>
                      <FormField label="Loại phòng"><Select value={roomForm.room_type_id} onValueChange={(value) => setRoomForm({ ...roomForm, room_type_id: value ?? "" })}><SelectTrigger><SelectValue placeholder="Chọn loại phòng" /></SelectTrigger><SelectContent>{roomTypes?.map((type) => <SelectItem key={type.id} value={String(type.id)}>{type.name}</SelectItem>)}</SelectContent></Select></FormField>
                      <FormField label="Ghi chú"><Input value={roomForm.note} onChange={(e) => setRoomForm({ ...roomForm, note: e.target.value })} /></FormField>
                    </div>
                    <DialogFooter><Button disabled={!roomForm.room_number || saveRoomMutation.isPending} onClick={() => saveRoomMutation.mutate()}>Lưu</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="grid max-h-[520px] flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleRooms.map((room) => {
                  const guests = allAssignments.filter((assignment) => assignment.room_id === room.id);
                  const full = room.occupied >= room.capacity;
                  const active = assignRoomId === String(room.id);
                  return (
                    <div key={room.id} role="button" tabIndex={0} onClick={() => !full && setAssignRoomId(String(room.id))} onKeyDown={(event) => { if (!full && (event.key === "Enter" || event.key === " ")) setAssignRoomId(String(room.id)); }} className={`rounded-xl border p-3 transition-colors ${active ? "border-primary bg-primary/5 ring-1 ring-primary" : full ? "cursor-not-allowed bg-muted/50 opacity-70" : "cursor-pointer hover:border-primary/40 hover:bg-muted/40"}`}>
                      <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">Phòng {room.room_number}</p><p className="text-xs text-muted-foreground">{roomTypes?.find((type) => type.id === room.room_type_id)?.name ?? "Chưa có loại"} · {room.occupied}/{room.capacity}</p></div><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); openEditRoom(room); }}>Sửa</Button></div>
                      <div className="mt-2 space-y-1">{guests.length ? guests.map((guest) => <div key={guest.id} className="flex items-center gap-1"><button type="button" className="min-w-0 flex-1 truncate text-left text-xs hover:underline" onClick={(event) => { event.stopPropagation(); setAssignEmployeeId(String(guest.employee_id)); setAssignRoomId(String(room.id)); }}>{guest.full_name}</button><ConfirmDialog trigger={<Button variant="ghost" className="h-6 px-1.5 text-[11px]">Bỏ</Button>} title="Bỏ gán phòng?" description={`${guest.full_name} sẽ trở lại danh sách chưa có phòng.`} confirmLabel="Bỏ gán" destructive onConfirm={() => unassignMutation.mutate(guest.id)} /></div>) : <p className="text-xs text-muted-foreground">Phòng trống</p>}</div>
                      <div className="mt-2 border-t border-border pt-1"><ConfirmDialog trigger={<Button variant="ghost" className="h-6 px-0 text-[11px] text-muted-foreground">Xoá phòng</Button>} title="Xoá phòng này?" description="Chỉ xoá được khi phòng không còn người." confirmLabel="Xoá" destructive onConfirm={() => deleteRoomMutation.mutate(room.id)} /></div>
                    </div>
                  );
                })}
                {visibleRooms.length === 0 && <p className="col-span-full p-8 text-center text-sm text-muted-foreground">Không có phòng phù hợp bộ lọc.</p>}
              </div>
            </section>
          </div>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="mr-auto"><p className="text-xs text-muted-foreground">Đang phân</p><p className="text-sm font-medium">{selectedEmployee ? `${selectedEmployee.employee_code ?? "—"} · ${selectedEmployee.full_name}` : "Chọn nhân sự bên trái"} → {selectedRoom ? `Phòng ${selectedRoom.room_number}` : "chọn phòng bên phải"}</p></div>
            <Button variant="ghost" size="sm" onClick={() => { setAssignEmployeeId(""); setAssignRoomId(""); }}>Bỏ chọn</Button>
            <Button disabled={!assignEmployeeId || !assignRoomId || !!selectedRoom && selectedRoom.occupied >= selectedRoom.capacity || assignMutation.isPending} onClick={() => assignMutation.mutate({ employeeId: Number(assignEmployeeId), roomId: Number(assignRoomId) })}>Gán / đổi phòng</Button>
          </div>
        </>
      )}
    </div>
  );
}
