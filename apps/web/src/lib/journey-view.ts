import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { directionLabel } from "@/lib/labels";
import type { Journey } from "@/types/api";

export type JourneyGap = {
  id: string;
  label: string;
  href: string;
};

export type TimelineKind = "flight" | "bus" | "hotel" | "gala" | "program";

export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  at: number | null;
  timeLabel: string;
  title: string;
  lines: string[];
  href?: string;
  tel?: string;
  telLabel?: string;
};

export type TimelineDay = {
  key: string;
  label: string;
  items: TimelineItem[];
};

export type JourneyNext = {
  label: string;
  detail: string;
  href?: string;
  warn: boolean;
};

const KIND_RANK: Record<TimelineKind, number> = {
  bus: 0,
  flight: 1,
  hotel: 2,
  gala: 3,
  program: 4,
};

export const KIND_LABEL: Record<TimelineKind, string> = {
  flight: "Chuyến bay",
  bus: "Xe",
  hotel: "Khách sạn",
  gala: "Gala Dinner",
  program: "Chương trình",
};

function dayKeyFromIso(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function isGalaSelectable(journey: Journey): boolean {
  return !!journey.gala && (journey.gala.status === "drawing" || journey.gala.status === "in_progress");
}

export function journeyGaps(journey: Journey): JourneyGap[] {
  const gaps: JourneyGap[] = [];
  const outbound = journey.flights.some((f) => f.direction === "outbound");
  const inbound = journey.flights.some((f) => f.direction === "inbound");
  if (journey.flights.length === 0) {
    gaps.push({ id: "flights", label: "Chưa có chuyến bay", href: "/chat" });
  } else if (!outbound) {
    gaps.push({ id: "outbound", label: "Chưa có chuyến chiều đi", href: "/chat" });
  } else if (!inbound) {
    gaps.push({ id: "inbound", label: "Chưa có chuyến chiều về", href: "/chat" });
  }
  if (journey.buses.length === 0) {
    gaps.push({ id: "buses", label: "Chưa có thông tin xe", href: "/chat" });
  }
  if (!journey.room) {
    gaps.push({ id: "room", label: "Chưa có phòng khách sạn", href: "/chat" });
  }
  if (journey.gala && journey.gala.tables.length === 0) {
    gaps.push({
      id: "gala",
      label: isGalaSelectable(journey) ? "Team chưa chọn ghế Gala" : "Team chưa có ghế Gala",
      href: `/gala/${journey.event_id}`,
    });
  }
  return gaps;
}

export function buildTimeline(journey: Journey): TimelineDay[] {
  const items: TimelineItem[] = [];

  journey.flights.forEach((f, i) => {
    const at = ms(f.depart_at);
    items.push({
      id: `flight-${f.direction}-${i}`,
      kind: "flight",
      at,
      timeLabel: f.depart_at ? formatTime(f.depart_at) : "—",
      title: `${directionLabel(f.direction)} · ${f.flight_code}${f.airline ? ` ${f.airline}` : ""}`,
      lines: [
        `${f.origin ?? "—"} → ${f.destination ?? "—"}`,
        f.depart_at ? formatDateTime(f.depart_at) : "",
        f.arrive_at ? `Đến ${formatTime(f.arrive_at)}` : "",
      ].filter(Boolean),
    });
  });

  journey.buses.forEach((b, i) => {
    const at = ms(b.gather_at) ?? ms(b.depart_at);
    const lines = [
      b.pickup_name
        ? `Tập trung: ${b.pickup_name}${b.pickup_address ? ` — ${b.pickup_address}` : ""}`
        : "",
      b.gather_at ? `Giờ tập trung: ${formatDateTime(b.gather_at)}` : "",
      b.depart_at ? `Khởi hành: ${formatDateTime(b.depart_at)}` : "",
      b.destination ? `Điểm đến: ${b.destination}` : "",
      b.leader_name ? `Trưởng xe: ${b.leader_name}` : "",
      b.note ? `Lưu ý: ${b.note}` : "",
    ].filter(Boolean);
    items.push({
      id: `bus-${i}-${b.bus_code}`,
      kind: "bus",
      at,
      timeLabel: b.gather_at ? formatTime(b.gather_at) : b.depart_at ? formatTime(b.depart_at) : "—",
      title: `${b.leg_name} · xe ${b.bus_code}${b.bus_name ? ` (${b.bus_name})` : ""}`,
      lines,
      tel: b.leader_phone ?? undefined,
      telLabel: b.leader_name ? `Gọi ${b.leader_name}` : b.leader_phone ?? undefined,
    });
  });

  if (journey.room) {
    const at = ms(journey.room.checkin_date ? `${journey.room.checkin_date}T14:00:00` : null);
    items.push({
      id: "hotel",
      kind: "hotel",
      at,
      timeLabel: journey.room.checkin_date ? formatDate(journey.room.checkin_date) : "KS",
      title: `${journey.room.hotel_name} · phòng ${journey.room.room_number}`,
      lines: [
        journey.room.hotel_address ?? "",
        journey.room.checkin_date || journey.room.checkout_date
          ? `${formatDate(journey.room.checkin_date)} → ${formatDate(journey.room.checkout_date)}`
          : "",
      ].filter(Boolean),
    });
  }

  const galaSeatLines =
    journey.gala?.tables.map((t) => {
      const seat = t.seats.map((s) => s.label ?? s.seat_number).join(", ");
      return `Bàn ${t.table_name ?? t.table_code}${seat ? ` · ghế ${seat}` : ""}`;
    }) ?? [];

  journey.schedule.forEach((s, i) => {
    const at = ms(s.start_at);
    const isGalaSlot = /gala/i.test(s.title);
    items.push({
      id: isGalaSlot ? "gala" : `sched-${i}`,
      kind: isGalaSlot ? "gala" : "program",
      at,
      timeLabel: s.start_at ? formatTime(s.start_at) : "—",
      title: s.title,
      lines: [
        [s.location, s.end_at ? `đến ${formatTime(s.end_at)}` : ""].filter(Boolean).join(" · "),
        ...(isGalaSlot ? galaSeatLines : []),
      ].filter(Boolean),
      href: isGalaSlot ? `/gala/${journey.event_id}` : undefined,
    });
  });

  if (journey.gala && !items.some((i) => i.kind === "gala")) {
    items.push({
      id: "gala",
      kind: "gala",
      at: null,
      timeLabel: "Gala",
      title: journey.gala.name,
      lines: galaSeatLines.length > 0 ? galaSeatLines : ["Team chưa chọn bàn/ghế"],
      href: `/gala/${journey.event_id}`,
    });
  }

  items.sort((a, b) => {
    if (a.at != null && b.at != null && a.at !== b.at) return a.at - b.at;
    if (a.at != null && b.at == null) return -1;
    if (a.at == null && b.at != null) return 1;
    return KIND_RANK[a.kind] - KIND_RANK[b.kind];
  });

  const days = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const key =
      item.at != null
        ? dayKeyFromIso(new Date(item.at).toISOString()) ?? "undated"
        : item.kind === "hotel" && journey.room?.checkin_date
          ? journey.room.checkin_date
          : "undated";
    const list = days.get(key) ?? [];
    list.push(item);
    days.set(key, list);
  }

  const ordered = [...days.entries()].sort(([a], [b]) => {
    if (a === "undated") return 1;
    if (b === "undated") return -1;
    return a.localeCompare(b);
  });

  return ordered.map(([key, dayItems]) => ({
    key,
    label: key === "undated" ? "Chưa gắn ngày" : formatDate(key),
    items: dayItems,
  }));
}

export function jumpTargets(days: TimelineDay[]): { kind: TimelineKind; label: string }[] {
  const present = new Set(days.flatMap((d) => d.items.map((i) => i.kind)));
  const order: { kind: TimelineKind; label: string }[] = [
    { kind: "flight", label: "Bay" },
    { kind: "bus", label: "Xe" },
    { kind: "hotel", label: "Lưu trú" },
    { kind: "gala", label: "Gala" },
    { kind: "program", label: "Lịch" },
  ];
  return order.filter((x) => present.has(x.kind));
}

export function firstAnchorId(kind: TimelineKind, days: TimelineDay[]): string | null {
  for (const day of days) {
    const hit = day.items.find((i) => i.kind === kind);
    if (hit) return hit.id;
  }
  return null;
}

export function journeyNext(journey: Journey, gaps: JourneyGap[]): JourneyNext | null {
  const galaOpen = isGalaSelectable(journey);
  const galaGap = gaps.find((g) => g.id === "gala");
  if (galaOpen && galaGap) {
    return {
      label: "Đến lượt chọn ghế Gala",
      detail: "Trưởng nhóm vào sơ đồ để giữ và xác nhận ghế cho team.",
      href: galaGap.href,
      warn: true,
    };
  }
  if (gaps[0]) {
    return {
      label: gaps[0].label,
      detail: "BTC sẽ cập nhật trên hành trình này. Bạn có thể hỏi trợ lý nếu cần biết khi nào có.",
      href: gaps[0].href,
      warn: true,
    };
  }

  const now = Date.now();
  const timed: { at: number; title: string; detail: string }[] = [];
  for (const f of journey.flights) {
    const at = ms(f.depart_at);
    if (at != null) {
      timed.push({
        at,
        title: `${directionLabel(f.direction)} ${f.flight_code}`,
        detail: `${f.origin ?? "—"} → ${f.destination ?? "—"} · ${formatDateTime(f.depart_at)}`,
      });
    }
  }
  for (const b of journey.buses) {
    const at = ms(b.gather_at) ?? ms(b.depart_at);
    if (at != null) {
      timed.push({
        at,
        title: `${b.leg_name} · xe ${b.bus_code}`,
        detail: b.pickup_name
          ? `Tập trung ${b.pickup_name}${b.gather_at ? ` · ${formatDateTime(b.gather_at)}` : ""}`
          : formatDateTime(b.gather_at ?? b.depart_at),
      });
    }
  }
  for (const s of journey.schedule) {
    const at = ms(s.start_at);
    if (at != null) {
      timed.push({
        at,
        title: s.title,
        detail: [s.location, formatDateTime(s.start_at)].filter(Boolean).join(" · "),
      });
    }
  }
  timed.sort((a, b) => a.at - b.at);
  const upcoming = timed.find((t) => t.at >= now) ?? timed[0];
  if (!upcoming) return null;
  return {
    label: upcoming.at >= now ? `Tiếp theo: ${upcoming.title}` : upcoming.title,
    detail: upcoming.detail,
    warn: false,
  };
}
