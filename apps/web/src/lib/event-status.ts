import type { EventStatus } from "@/types/api";

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Nháp",
  registration_open: "Đang mở đăng ký",
  registration_closed: "Đã đóng đăng ký",
  allocation_processing: "Đang phân bổ",
  information_published: "Đã công bố",
  event_started: "Đang diễn ra",
  event_completed: "Đã kết thúc",
};

// Organizer can only move forward along this graph; super_admin can override to any status.
export const EVENT_FORWARD_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ["registration_open"],
  registration_open: ["registration_closed"],
  registration_closed: ["allocation_processing", "registration_open"],
  allocation_processing: ["information_published", "registration_closed"],
  information_published: ["event_started"],
  event_started: ["event_completed"],
  event_completed: [],
};

export const ALL_EVENT_STATUSES: EventStatus[] = [
  "draft",
  "registration_open",
  "registration_closed",
  "allocation_processing",
  "information_published",
  "event_started",
  "event_completed",
];
