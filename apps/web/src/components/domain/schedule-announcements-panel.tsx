"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";

type ScheduleItem = {
  id: number;
  title: string;
  location: string | null;
  is_published: boolean;
};

type Announcement = {
  id: number;
  title: string;
  body_md: string;
  is_pinned: boolean;
};

export function ScheduleAnnouncementsPanel({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleLocation, setScheduleLocation] = useState("");
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");

  const { data: schedule } = useQuery({
    queryKey: ["events", eventId, "schedule-items"],
    queryFn: () => apiFetch<ScheduleItem[]>(`/api/events/${eventId}/schedule-items`),
  });

  const { data: announcements } = useQuery({
    queryKey: ["events", eventId, "announcements"],
    queryFn: () => apiFetch<Announcement[]>(`/api/events/${eventId}/announcements`),
  });

  const createScheduleMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/events/${eventId}/schedule-items`, {
        method: "POST",
        body: JSON.stringify({ title: scheduleTitle, location: scheduleLocation || null }),
      }),
    onSuccess: () => {
      toast.success("Đã thêm lịch trình");
      setScheduleOpen(false);
      setScheduleTitle("");
      setScheduleLocation("");
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "schedule-items"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const togglePublishMutation = useMutation({
    mutationFn: (item: ScheduleItem) =>
      apiFetch(`/api/events/${eventId}/schedule-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_published: !item.is_published }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "schedule-items"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/events/${eventId}/announcements`, {
        method: "POST",
        body: JSON.stringify({ title: announcementTitle, body_md: announcementBody }),
      }),
    onSuccess: () => {
      toast.success("Đã đăng thông báo");
      setAnnouncementOpen(false);
      setAnnouncementTitle("");
      setAnnouncementBody("");
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "announcements"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Lịch trình</p>
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger className={buttonVariants({ size: "sm", variant: "outline" }) + " ml-auto"}>
              Thêm
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Thêm mục lịch trình</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sched-title">Tiêu đề</Label>
                  <Input
                    id="sched-title"
                    value={scheduleTitle}
                    onChange={(e) => setScheduleTitle(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sched-location">Địa điểm</Label>
                  <Input
                    id="sched-location"
                    value={scheduleLocation}
                    onChange={(e) => setScheduleLocation(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!scheduleTitle || createScheduleMutation.isPending}
                  onClick={() => createScheduleMutation.mutate()}
                >
                  Lưu
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tiêu đề</TableHead>
              <TableHead>Địa điểm</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule?.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.title}</TableCell>
                <TableCell>{s.location ?? "—"}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePublishMutation.mutate(s)}
                    disabled={togglePublishMutation.isPending}
                  >
                    <Badge variant={s.is_published ? "default" : "secondary"}>
                      {s.is_published ? "Đã hiện" : "Ẩn"}
                    </Badge>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(!schedule || schedule.length === 0) && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-zinc-500">
                  Chưa có lịch trình
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Thông báo</p>
          <Dialog open={announcementOpen} onOpenChange={setAnnouncementOpen}>
            <DialogTrigger className={buttonVariants({ size: "sm", variant: "outline" }) + " ml-auto"}>
              Đăng thông báo
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Thông báo mới</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ann-title">Tiêu đề</Label>
                  <Input
                    id="ann-title"
                    value={announcementTitle}
                    onChange={(e) => setAnnouncementTitle(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ann-body">Nội dung</Label>
                  <Textarea
                    id="ann-body"
                    value={announcementBody}
                    onChange={(e) => setAnnouncementBody(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={
                    !announcementTitle || !announcementBody || createAnnouncementMutation.isPending
                  }
                  onClick={() => createAnnouncementMutation.mutate()}
                >
                  Đăng
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex flex-col gap-2">
          {announcements?.map((a) => (
            <div key={a.id} className="rounded-md border p-2 text-sm">
              <p className="font-medium">{a.title}</p>
              <p className="text-zinc-500">{a.body_md}</p>
            </div>
          ))}
          {(!announcements || announcements.length === 0) && (
            <p className="text-sm text-zinc-500">Chưa có thông báo</p>
          )}
        </div>
      </div>
    </div>
  );
}
