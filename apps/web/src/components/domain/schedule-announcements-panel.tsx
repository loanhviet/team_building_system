"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Download, Eye, Info, MapPin, Megaphone, Pencil, Pin, Plus, Smartphone, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EventDateTimeField } from "@/components/domain/event-date-time-field";
import { FormField, MoreFields } from "@/components/domain/form-field";
import { LiteMarkdown } from "@/components/domain/lite-markdown";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { apiDownload, apiFetch, ApiError } from "@/lib/api";
import {
  addMinutesToDatetimeLocal,
  durationLabel as timeDurationLabel,
  eventDateOptions,
  fromDatetimeLocal,
  splitDatetimeLocal,
  toDatetimeLocal,
} from "@/lib/datetime";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Announcement, Dashboard, Event, ScheduleItem, Shift, Team } from "@/types/api";

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
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [annFilter, setAnnFilter] = useState<"all" | "pinned">("all");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [viewingSchedule, setViewingSchedule] = useState<ScheduleItem | null>(null);
  const [exporting, setExporting] = useState(false);

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

  const { data: dashboard } = useQuery({
    queryKey: ["events", eventId, "dashboard"],
    queryFn: () => apiFetch<Dashboard>(`/api/events/${eventId}/dashboard`),
  });

  const invalidateSchedule = () =>
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "schedule-items"] });
  const invalidateAnnouncements = () =>
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "announcements"] });

  const openCreateSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm({
      ...EMPTY_SCHEDULE,
      day_date: event?.start_date ?? "",
      start_at: event?.start_date ? `${event.start_date}T09:00` : "",
      end_at: event?.start_date ? `${event.start_date}T10:00` : "",
    });
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
  const scheduleDateOptions = eventDateOptions(event?.start_date, event?.end_date);
  const scheduleDuration = timeDurationLabel(scheduleForm.start_at, scheduleForm.end_at);
  const updateScheduleStart = (startAt: string) => {
    setScheduleForm((current) => ({
      ...current,
      start_at: startAt,
      day_date: splitDatetimeLocal(startAt).date || current.day_date,
      end_at: current.end_at || addMinutesToDatetimeLocal(startAt, 60),
    }));
  };
  const setScheduleDuration = (minutes: number) => {
    if (!scheduleForm.start_at) {
      toast.error("Hãy chọn giờ bắt đầu trước");
      return;
    }
    setScheduleForm((current) => ({
      ...current,
      end_at: addMinutesToDatetimeLocal(current.start_at, minutes),
    }));
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
    if (item.audience === "all") return "Tất cả nhân viên";
    if (item.audience === "shift") return shifts?.find((s) => s.id === item.audience_ref_id)?.name ?? "Ca #" + item.audience_ref_id;
    return teams?.find((t) => t.id === item.audience_ref_id)?.name ?? "Team #" + item.audience_ref_id;
  };

  const durationLabel = (item: ScheduleItem) => {
    if (!item.start_at || !item.end_at) return null;
    const ms = new Date(item.end_at).getTime() - new Date(item.start_at).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return `${Math.round(ms / 60000)} phút`;
  };

  const items = useMemo(
    () => [...(schedule ?? [])].sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? "")),
    [schedule],
  );
  const days = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const s of items) {
      const key = s.day_date ?? "undated";
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items]);
  const visibleItems = dayFilter === "all" ? items : items.filter((s) => (s.day_date ?? "undated") === dayFilter);
  const publishedCount = items.filter((s) => s.is_published).length;
  const draftCount = items.length - publishedCount;
  const pinnedCount = announcements?.filter((a) => a.is_pinned).length ?? 0;
  const visibleAnnouncements = (announcements ?? []).filter((a) => annFilter === "all" || a.is_pinned);

  const handleExport = async () => {
    setExporting(true);
    try {
      await apiDownload(`/api/events/${eventId}/schedule-items/export`, `schedule_event_${eventId}.xlsx`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Tải file thất bại");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setPreviewOpen(true)}>
          <Smartphone className="size-4" aria-hidden="true" />
          Xem trước giao diện nhân viên
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          <Download className="size-4" aria-hidden="true" />
          Xuất Excel
        </Button>
        <Button onClick={openCreateSchedule}>
          <Plus className="size-4" aria-hidden="true" />
          Thêm hoạt động
        </Button>
      </div>

      <section className="grid gap-4 lg:grid-cols-12">
        <div className="surface-card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between lg:col-span-8">
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold leading-none">{items.length}</p>
              <p className="text-sm text-muted-foreground">Hoạt động lịch trình</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-2 py-0.5 text-[11px] font-semibold text-[#15803D]">
                  {publishedCount} Đã công bố
                </span>
                <span className="rounded-md border border-[#FFEDD5] bg-[#FFF7ED] px-2 py-0.5 text-[11px] font-semibold text-[#C2410C]">
                  {draftCount} Bản nháp
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-xl bg-orange-50 text-[var(--ember)]">
              <Megaphone className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold leading-none">{announcements?.length ?? 0}</p>
              <p className="text-sm text-muted-foreground">Thông báo phát thanh</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {pinnedCount} Đang ghim
                </span>
                <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {(announcements?.length ?? 0) - pinnedCount} Thông thường
                </span>
              </div>
            </div>
          </div>
          {dashboard && (
            <div className="text-sm">
              <p className="font-semibold">{dashboard.participating_count} CBNV tham gia</p>
              <p className="text-xs text-muted-foreground">Phủ sóng lịch đã công bố</p>
            </div>
          )}
        </div>
        <div className="surface-card flex items-start gap-3 bg-slate-50 p-5 lg:col-span-4">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Lưu ý nghiệp vụ BTC</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Nhân viên chỉ xem mục <strong className="text-primary">Đã công bố</strong>. Bản nháp chỉ lưu hành nội bộ BTC.
            </p>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="surface-card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold">Lịch trình hoạt động chi tiết</p>
            <p className="text-xs text-muted-foreground">Kế hoạch thời gian thực & điều phối nhân sự từng chặng</p>
          </div>
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger className={buttonVariants({ className: "ml-auto" })} onClick={openCreateSchedule}>
              <Plus className="size-4" aria-hidden="true" />
              Thêm hoạt động mới
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
                  <FormField label="Bắt đầu" hint="Chọn ngày thuộc chương trình và giờ bắt đầu.">
                    <EventDateTimeField
                      ariaLabel="Bắt đầu hoạt động"
                      value={scheduleForm.start_at}
                      onChange={updateScheduleStart}
                      dateOptions={scheduleDateOptions}
                      defaultDate={event?.start_date ?? undefined}
                    />
                  </FormField>
                  <FormField label="Địa điểm">
                    <Input value={scheduleForm.location} onChange={(e) => setScheduleForm({ ...scheduleForm, location: e.target.value })} />
                  </FormField>
                </div>
                <FormField label="Kết thúc" hint={scheduleDuration ? `Thời lượng: ${scheduleDuration}.` : "Chọn giờ kết thúc hoặc dùng nút thời lượng nhanh."}>
                  <EventDateTimeField
                    ariaLabel="Kết thúc hoạt động"
                    value={scheduleForm.end_at}
                    onChange={(endAt) => setScheduleForm({ ...scheduleForm, end_at: endAt })}
                    dateOptions={scheduleDateOptions}
                    defaultDate={splitDatetimeLocal(scheduleForm.start_at).date || event?.start_date || undefined}
                  />
                </FormField>
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-muted/30 p-2 text-xs">
                  <span className="mr-1 text-muted-foreground">Thời lượng nhanh:</span>
                  {[30, 60, 90, 120].map((minutes) => (
                    <Button key={minutes} type="button" size="sm" variant="outline" onClick={() => setScheduleDuration(minutes)}>
                      {minutes < 60 ? `${minutes} phút` : `+${minutes / 60} giờ`}
                    </Button>
                  ))}
                </div>
                <MoreFields>
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
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setDayFilter("all")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              dayFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}
          >
            Tất cả các ngày ({items.length})
          </button>
          {days.map(([day], i) => (
            <button
              key={day}
              type="button"
              onClick={() => setDayFilter(day)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                dayFilter === day ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
            >
              Ngày {i + 1}
              {day !== "undated" ? `: ${formatDate(day)}` : ""}
            </button>
          ))}
        </div>
        {visibleItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có lịch trình.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visibleItems.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "rounded-xl border border-border p-4",
                  !s.is_published && "border-dashed bg-muted/30",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="shrink-0 rounded-lg bg-primary/10 px-2 py-1.5 text-center">
                      <p className="text-[10px] font-bold text-primary">
                        {s.day_date ? `NGÀY ${formatDate(s.day_date)}` : "—"}
                      </p>
                      <p className="font-display text-sm font-bold tabular">{s.start_at ? formatTime(s.start_at) : "—"}</p>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-semibold">{s.title}</h3>
                      {s.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {s.start_at ? formatTime(s.start_at) : "—"}
                          {s.end_at ? ` – ${formatTime(s.end_at)}` : ""}
                          {durationLabel(s) ? ` (${durationLabel(s)})` : ""}
                        </span>
                        {s.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" aria-hidden="true" />
                            {s.location}
                          </span>
                        )}
                        <span className="rounded-full bg-muted px-2 py-0.5">{audienceLabel(s)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                        s.is_published
                          ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]"
                          : "border-[#FFEDD5] bg-[#FFF7ED] text-[#C2410C]",
                      )}
                    >
                      {s.is_published ? "Đã công bố" : "Bản nháp"}
                    </span>
                    <div className="flex">
                      <Button variant="ghost" size="icon" aria-label="Xem" onClick={() => setViewingSchedule(s)}>
                        <Eye className="size-4" />
                      </Button>
                      {isPublished ? (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" className="h-8 px-2 text-xs" disabled={togglePublishMutation.isPending}>
                              {s.is_published ? "Ẩn" : "Hiện"}
                            </Button>
                          }
                          title="Đổi trạng thái hiển thị mục lịch trình?"
                          description="Sự kiện đã công bố — thay đổi này sẽ gửi email cập nhật lịch trình cho toàn bộ người tham gia."
                          confirmLabel="Đổi & gửi email"
                          onConfirm={() => togglePublishMutation.mutate(s)}
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          disabled={togglePublishMutation.isPending}
                          onClick={() => togglePublishMutation.mutate(s)}
                        >
                          {s.is_published ? "Ẩn" : "Hiện"}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label="Sửa" onClick={() => openEditSchedule(s)}>
                        <Pencil className="size-4" />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Xoá">
                            <Trash2 className="size-4" />
                          </Button>
                        }
                        title="Xoá mục lịch trình này?"
                        description={`"${s.title}" sẽ bị xoá khỏi lịch trình.`}
                        confirmLabel="Xoá"
                        destructive
                        onConfirm={() => deleteScheduleMutation.mutate(s.id)}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface-card flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold">Thông báo & Phát sóng nội bộ</p>
            <p className="text-xs text-muted-foreground">Kênh phát thanh tức thì trên cổng CBNV</p>
          </div>
          <Dialog open={announcementOpen} onOpenChange={setAnnouncementOpen}>
            <DialogTrigger className={buttonVariants({ className: "ml-auto" })} onClick={openCreateAnnouncement}>
              <Plus className="size-4" aria-hidden="true" />
              Tạo thông báo mới
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
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={announcementForm.is_pinned}
                    onCheckedChange={(v) => setAnnouncementForm({ ...announcementForm, is_pinned: v === true })}
                  />
                  Ghim lên đầu
                </label>
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
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", `Tất cả (${announcements?.length ?? 0})`],
              ["pinned", `Đang ghim (${pinnedCount})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setAnnFilter(id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                annFilter === id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {visibleAnnouncements.map((a) => (
            <article
              key={a.id}
              className={cn(
                "rounded-xl border p-4 text-sm",
                a.is_pinned ? "border-red-200 bg-red-50/40" : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="mb-1 flex flex-wrap gap-1">
                    {a.is_pinned && (
                      <Badge variant="secondary">
                        <Pin className="mr-1 size-3" aria-hidden="true" />
                        Đã ghim lên đầu
                      </Badge>
                    )}
                    {a.published_at && (
                      <span className="text-[11px] text-muted-foreground">{formatDate(a.published_at)}</span>
                    )}
                  </div>
                  <h3 className="font-semibold">{a.title}</h3>
                </div>
                <div className="flex shrink-0">
                  <Button size="icon" variant="ghost" aria-label={a.is_pinned ? "Bỏ ghim" : "Ghim"} onClick={() => togglePinMutation.mutate(a)}>
                    <Pin className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Sửa" onClick={() => openEditAnnouncement(a)}>
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button size="icon" variant="ghost" aria-label="Xoá">
                        <Trash2 className="size-4" />
                      </Button>
                    }
                    title="Xoá thông báo này?"
                    description={`"${a.title}" sẽ bị xoá.`}
                    confirmLabel="Xoá"
                    destructive
                    onConfirm={() => deleteAnnouncementMutation.mutate(a.id)}
                  />
                </div>
              </div>
              <LiteMarkdown text={a.body_md} className="mt-2 text-muted-foreground" />
            </article>
          ))}
          {visibleAnnouncements.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có thông báo</p>
          )}
        </div>
      </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Xem trước giao diện nhân viên</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Chỉ mục đã công bố — đúng những gì CBNV thấy trên Hành trình.</p>
          <div className="space-y-3">
            {items.filter((s) => s.is_published).map((s) => (
              <div key={s.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-semibold">{s.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[s.start_at ? formatTime(s.start_at) : null, s.location].filter(Boolean).join(" · ")}
                </p>
              </div>
            ))}
            {announcements?.filter((a) => a.published_at).map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-semibold">{a.title}</p>
                <LiteMarkdown text={a.body_md} className="text-muted-foreground" />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingSchedule} onOpenChange={(open) => !open && setViewingSchedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewingSchedule?.title}</DialogTitle>
          </DialogHeader>
          {viewingSchedule && (
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Thời gian</dt>
                <dd>
                  {viewingSchedule.start_at ? formatTime(viewingSchedule.start_at) : "—"}
                  {viewingSchedule.end_at ? ` – ${formatTime(viewingSchedule.end_at)}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Địa điểm</dt>
                <dd>{viewingSchedule.location ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Đối tượng</dt>
                <dd>{audienceLabel(viewingSchedule)}</dd>
              </div>
              {viewingSchedule.description && (
                <div>
                  <dt className="text-xs text-muted-foreground">Mô tả</dt>
                  <dd>{viewingSchedule.description}</dd>
                </div>
              )}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
