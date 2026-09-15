"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { FormField, MoreFields } from "@/components/domain/form-field";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { LiteMarkdown } from "@/components/domain/lite-markdown";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime";
import { formatDate, formatTime } from "@/lib/format";
import type { Announcement, Event, ScheduleItem, Shift, Team } from "@/types/api";

const PUBLISHED_STATUSES = new Set(["information_published", "event_started", "event_completed"]);

const EMPTY_SCHEDULE = {
  day_date: "",
  start_at: "",
  end_at: "",
  title: "",
  description: "",
  location: "",
  audience: "all" as "all" | "shift" | "team",
  audience_ref_id: "",
};

const EMPTY_ANNOUNCEMENT = { title: "", body_md: "", is_pinned: false };

export function ScheduleAnnouncementsPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT);

  const { data: schedule } = useQuery({
    queryKey: ["events", eventId, "schedule-items"],
    queryFn: () => apiFetch<ScheduleItem[]>(`/api/events/${eventId}/schedule-items`),
  });

  const { data: announcements } = useQuery({
    queryKey: ["events", eventId, "announcements"],
    queryFn: () => apiFetch<Announcement[]>(`/api/events/${eventId}/announcements`),
  });

  const { data: shifts } = useQuery({
    queryKey: ["events", eventId, "shifts"],
    queryFn: () => apiFetch<Shift[]>(`/api/events/${eventId}/shifts`),
  });

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => apiFetch<Team[]>("/api/teams"),
  });

  const { data: event } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => apiFetch<Event>(`/api/events/${eventId}`),
  });
  const isPublished = !!event && PUBLISHED_STATUSES.has(event.status);

  const invalidateSchedule = () =>
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "schedule-items"] });
  const invalidateAnnouncements = () =>
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "announcements"] });

  const openCreateSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm(EMPTY_SCHEDULE);
    setScheduleOpen(true);
  };
  const openEditSchedule = (item: ScheduleItem) => {
    setEditingSchedule(item);
    setScheduleForm({
      day_date: item.day_date ?? "",
      start_at: toDatetimeLocal(item.start_at),
      end_at: toDatetimeLocal(item.end_at),
      title: item.title,
      description: item.description ?? "",
      location: item.location ?? "",
      audience: item.audience,
      audience_ref_id: item.audience_ref_id ? String(item.audience_ref_id) : "",
    });
    setScheduleOpen(true);
  };

  const saveScheduleMutation = useMutation({
    mutationFn: () => {
      const payload = {
        day_date: scheduleForm.day_date || null,
        start_at: fromDatetimeLocal(scheduleForm.start_at),
        end_at: fromDatetimeLocal(scheduleForm.end_at),
        title: scheduleForm.title,
        description: scheduleForm.description || null,
        location: scheduleForm.location || null,
        audience: scheduleForm.audience,
        audience_ref_id: scheduleForm.audience !== "all" && scheduleForm.audience_ref_id
          ? Number(scheduleForm.audience_ref_id)
          : null,
      };
      return editingSchedule
        ? apiFetch<ScheduleItem>(`/api/events/${eventId}/schedule-items/${editingSchedule.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : apiFetch<ScheduleItem>(`/api/events/${eventId}/schedule-items`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
    },
    onSuccess: () => {
      toast.success(editingSchedule ? "Đã cập nhật lịch trình" : "Đã thêm lịch trình");
      setScheduleOpen(false);
      invalidateSchedule();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/events/${eventId}/schedule-items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Đã xoá mục lịch trình");
      invalidateSchedule();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const togglePublishMutation = useMutation({
    mutationFn: (item: ScheduleItem) =>
      apiFetch(`/api/events/${eventId}/schedule-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_published: !item.is_published }),
      }),
    onSuccess: invalidateSchedule,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const openCreateAnnouncement = () => {
    setEditingAnnouncement(null);
    setAnnouncementForm(EMPTY_ANNOUNCEMENT);
    setAnnouncementOpen(true);
  };
  const openEditAnnouncement = (a: Announcement) => {
    setEditingAnnouncement(a);
    setAnnouncementForm({ title: a.title, body_md: a.body_md, is_pinned: a.is_pinned });
    setAnnouncementOpen(true);
  };

  const saveAnnouncementMutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: announcementForm.title,
        body_md: announcementForm.body_md,
        is_pinned: announcementForm.is_pinned,
      };
      return editingAnnouncement
        ? apiFetch<Announcement>(`/api/events/${eventId}/announcements/${editingAnnouncement.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : apiFetch<Announcement>(`/api/events/${eventId}/announcements`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
    },
    onSuccess: () => {
      toast.success(editingAnnouncement ? "Đã cập nhật thông báo" : "Đã đăng thông báo");
      setAnnouncementOpen(false);
      invalidateAnnouncements();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/events/${eventId}/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Đã xoá thông báo");
      invalidateAnnouncements();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const togglePinMutation = useMutation({
    mutationFn: (a: Announcement) =>
      apiFetch(`/api/events/${eventId}/announcements/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_pinned: !a.is_pinned }),
      }),
    onSuccess: invalidateAnnouncements,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const audienceLabel = (item: ScheduleItem) => {
    if (item.audience === "all") return "Tất cả";
    if (item.audience === "shift") return shifts?.find((s) => s.id === item.audience_ref_id)?.name ?? "Ca #" + item.audience_ref_id;
    return teams?.find((t) => t.id === item.audience_ref_id)?.name ?? "Team #" + item.audience_ref_id;
  };

  const scheduleColumns: DataTableColumn<ScheduleItem>[] = [
    {
      key: "day_date",
      header: "Ngày",
      cell: (s) => s.day_date ?? "—",
      sortValue: (s) => s.day_date,
    },
    {
      key: "start_at",
      header: "Giờ",
      cell: (s) => (s.start_at ? new Date(s.start_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—"),
      sortValue: (s) => s.start_at,
    },
    { key: "title", header: "Tiêu đề", cell: (s) => s.title, sortValue: (s) => s.title },
    { key: "location", header: "Địa điểm", cell: (s) => s.location ?? "—" },
    { key: "audience", header: "Đối tượng", cell: (s) => audienceLabel(s) },
    {
      key: "is_published",
      header: "Trạng thái",
      cell: (s) =>
        isPublished ? (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" disabled={togglePublishMutation.isPending}>
                <Badge variant={s.is_published ? "default" : "secondary"}>{s.is_published ? "Đã hiện" : "Ẩn"}</Badge>
              </Button>
            }
            title="Đổi trạng thái hiển thị mục lịch trình?"
            description="Sự kiện đã công bố — thay đổi này sẽ gửi email cập nhật lịch trình cho toàn bộ người tham gia."
            confirmLabel="Đổi & gửi email"
            onConfirm={() => togglePublishMutation.mutate(s)}
          />
        ) : (
          <Button variant="ghost" size="sm" onClick={() => togglePublishMutation.mutate(s)} disabled={togglePublishMutation.isPending}>
            <Badge variant={s.is_published ? "default" : "secondary"}>{s.is_published ? "Đã hiện" : "Ẩn"}</Badge>
          </Button>
        ),
    },
    {
      key: "actions",
      header: "",
      cell: (s) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => openEditSchedule(s)}>
            Sửa
          </Button>
          <ConfirmDialog
            trigger={<Button size="sm" variant="ghost">Xoá</Button>}
            title="Xoá mục lịch trình này?"
            description={`"${s.title}" sẽ bị xoá khỏi lịch trình.`}
            confirmLabel="Xoá"
            destructive
            onConfirm={() => deleteScheduleMutation.mutate(s.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Lịch trình</p>
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger className={buttonVariants({ size: "sm", variant: "outline", className: "ml-auto" })} onClick={openCreateSchedule}>
              Thêm
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingSchedule ? "Sửa mục lịch trình" : "Thêm mục lịch trình"}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <FormField label="Tiêu đề" required>
                  <Input value={scheduleForm.title} onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })} />
                </FormField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Bắt đầu">
                    <Input type="datetime-local" value={scheduleForm.start_at} onChange={(e) => setScheduleForm({ ...scheduleForm, start_at: e.target.value })} />
                  </FormField>
                  <FormField label="Địa điểm">
                    <Input value={scheduleForm.location} onChange={(e) => setScheduleForm({ ...scheduleForm, location: e.target.value })} />
                  </FormField>
                </div>
                <MoreFields>
                  <FormField label="Ngày">
                    <Input type="date" value={scheduleForm.day_date} onChange={(e) => setScheduleForm({ ...scheduleForm, day_date: e.target.value })} />
                  </FormField>
                  <FormField label="Kết thúc">
                    <Input type="datetime-local" value={scheduleForm.end_at} onChange={(e) => setScheduleForm({ ...scheduleForm, end_at: e.target.value })} />
                  </FormField>
                  <FormField label="Đối tượng">
                    <Select value={scheduleForm.audience} onValueChange={(v) => setScheduleForm({ ...scheduleForm, audience: (v ?? "all") as typeof scheduleForm.audience, audience_ref_id: "" })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả</SelectItem>
                        <SelectItem value="shift">Theo Ca</SelectItem>
                        <SelectItem value="team">Theo Team</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  {scheduleForm.audience !== "all" && (
                    <FormField label={scheduleForm.audience === "shift" ? "Chọn Ca" : "Chọn Team"}>
                      <Select value={scheduleForm.audience_ref_id} onValueChange={(v) => setScheduleForm({ ...scheduleForm, audience_ref_id: v ?? "" })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(scheduleForm.audience === "shift" ? shifts : teams)?.map((o) => (
                            <SelectItem key={o.id} value={String(o.id)}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  )}
                  <FormField label="Mô tả" className="sm:col-span-2">
                    <Textarea value={scheduleForm.description} onChange={(e) => setScheduleForm({ ...scheduleForm, description: e.target.value })} />
                  </FormField>
                </MoreFields>
              </div>
              <DialogFooter>
                {isPublished ? (
                  <ConfirmDialog
                    trigger={<Button disabled={!scheduleForm.title || saveScheduleMutation.isPending}>Lưu</Button>}
                    title="Lưu lịch trình?"
                    description="Sự kiện đã công bố — lưu thay đổi này sẽ gửi email cập nhật lịch trình cho toàn bộ người tham gia."
                    confirmLabel="Lưu & gửi email"
                    onConfirm={() => saveScheduleMutation.mutate()}
                  />
                ) : (
                  <Button disabled={!scheduleForm.title || saveScheduleMutation.isPending} onClick={() => saveScheduleMutation.mutate()}>
                    Lưu
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {(() => {
          const items = [...(schedule ?? [])].sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""));
          const days = new Map<string, typeof items>();
          for (const s of items) {
            const key = s.day_date ?? "undated";
            const list = days.get(key) ?? [];
            list.push(s);
            days.set(key, list);
          }
          if (items.length === 0) {
            return <p className="text-sm text-muted-foreground">Chưa có lịch trình.</p>;
          }
          return (
            <ol className="flex flex-col gap-4">
              {[...days.entries()].map(([day, list]) => (
                <li key={day}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {day === "undated" ? "Chưa gắn ngày" : formatDate(day)}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {list.map((s) => (
                      <li key={s.id} className="rounded-xl border border-border bg-card px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="tabular text-xs text-muted-foreground">
                              {s.start_at ? formatTime(s.start_at) : "—"}
                              {s.end_at ? ` – ${formatTime(s.end_at)}` : ""}
                            </p>
                            <p className="font-medium">{s.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {[s.location, audienceLabel(s), s.is_published ? "Đã hiện" : "Ẩn"]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => openEditSchedule(s)}>
                              Sửa
                            </Button>
                            <ConfirmDialog
                              trigger={<Button variant="ghost" className="h-8 px-2 text-xs">Xoá</Button>}
                              title="Xoá mục lịch trình này?"
                              description={`"${s.title}" sẽ bị xoá khỏi lịch trình.`}
                              confirmLabel="Xoá"
                              destructive
                              onConfirm={() => deleteScheduleMutation.mutate(s.id)}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          );
        })()}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Thông báo</p>
          <Dialog open={announcementOpen} onOpenChange={setAnnouncementOpen}>
            <DialogTrigger className={buttonVariants({ size: "sm", variant: "outline", className: "ml-auto" })} onClick={openCreateAnnouncement}>
              Đăng thông báo
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingAnnouncement ? "Sửa thông báo" : "Thông báo mới"}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ann-title">Tiêu đề</Label>
                  <Input id="ann-title" value={announcementForm.title} onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ann-body">Nội dung (hỗ trợ **đậm**, *nghiêng*, [link](url))</Label>
                  <Textarea id="ann-body" value={announcementForm.body_md} onChange={(e) => setAnnouncementForm({ ...announcementForm, body_md: e.target.value })} />
                </div>
                {announcementForm.body_md && (
                  <div className="rounded-md border bg-muted/40 p-2 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">Xem trước:</p>
                    <LiteMarkdown text={announcementForm.body_md} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  disabled={!announcementForm.title || !announcementForm.body_md || saveAnnouncementMutation.isPending}
                  onClick={() => saveAnnouncementMutation.mutate()}
                >
                  {editingAnnouncement ? "Lưu" : "Đăng"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex flex-col gap-2">
          {announcements?.map((a) => (
            <div key={a.id} className="rounded-md border p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">
                  {a.is_pinned && (
                    <Badge variant="secondary" className="mr-1">
                      Ghim
                    </Badge>
                  )}
                  {a.title}
                </p>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => togglePinMutation.mutate(a)}>
                    {a.is_pinned ? "Bỏ ghim" : "Ghim"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEditAnnouncement(a)}>
                    Sửa
                  </Button>
                  <ConfirmDialog
                    trigger={<Button size="sm" variant="ghost">Xoá</Button>}
                    title="Xoá thông báo này?"
                    description={`"${a.title}" sẽ bị xoá.`}
                    confirmLabel="Xoá"
                    destructive
                    onConfirm={() => deleteAnnouncementMutation.mutate(a.id)}
                  />
                </div>
              </div>
              <LiteMarkdown text={a.body_md} className="text-muted-foreground" />
            </div>
          ))}
          {(!announcements || announcements.length === 0) && (
            <p className="text-sm text-muted-foreground">Chưa có thông báo</p>
          )}
        </div>
      </div>
    </div>
  );
}
