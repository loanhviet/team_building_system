export function parseApiDateTime(value: string): Date {
  // System timestamps (created_at, submitted_at, Gala expiry) are naive UTC.
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasOffset || /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : `${value}Z`);
}

export function parseEventDateTime(value: string): Date {
  // Operational times entered by BTC (flights, buses, schedules) are Vietnam
  // wall-clock times in the existing database, regardless of browser zone.
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasOffset ? value : `${value}+07:00`);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return parseEventDateTime(value).toLocaleString("vi-VN", {
    day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export function formatUtcDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return parseApiDateTime(value).toLocaleString("vi-VN", {
    day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return parseEventDateTime(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("vi-VN");
  }
  return parseEventDateTime(value).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function formatUtcDate(value: string | null | undefined): string {
  if (!value) return "—";
  return parseApiDateTime(value).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function formatLongDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00+07:00`)
    : parseEventDateTime(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export const ROLE_LABEL: Record<string, string> = {
  employee: "CBNV",
  team_leader: "Trưởng nhóm",
  organizer: "BTC",
  super_admin: "Super Admin",
};
