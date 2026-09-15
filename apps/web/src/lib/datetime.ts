export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 16);
}

export function fromDatetimeLocal(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export type EventDateOption = { value: string; label: string };

function dateAtNoon(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function eventDateOptions(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): EventDateOption[] {
  if (!startDate) return [];
  const start = dateAtNoon(startDate);
  const end = dateAtNoon(endDate || startDate);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start) return [];

  const options: EventDateOption[] = [];
  const formatter = new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const cursor = new Date(start);
  while (cursor <= end && options.length < 31) {
    const value = [cursor.getFullYear(), String(cursor.getMonth() + 1).padStart(2, "0"), String(cursor.getDate()).padStart(2, "0")].join("-");
    options.push({ value, label: formatter.format(cursor).replace(/^./, (c) => c.toUpperCase()) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return options;
}

export function splitDatetimeLocal(value: string): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const [date = "", time = ""] = value.slice(0, 16).split("T");
  return { date, time };
}

export function joinDatetimeLocal(date: string, time: string): string {
  return date && time ? `${date}T${time}` : "";
}

export function addMinutesToDatetimeLocal(value: string, minutes: number): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  parsed.setMinutes(parsed.getMinutes() + minutes);
  const date = [parsed.getFullYear(), String(parsed.getMonth() + 1).padStart(2, "0"), String(parsed.getDate()).padStart(2, "0")].join("-");
  const time = [String(parsed.getHours()).padStart(2, "0"), String(parsed.getMinutes()).padStart(2, "0")].join(":");
  return joinDatetimeLocal(date, time);
}

export function addDaysToDate(value: string, days: number): string {
  if (!value) return "";
  const parsed = dateAtNoon(value);
  if (Number.isNaN(parsed.valueOf())) return "";
  parsed.setDate(parsed.getDate() + days);
  return [parsed.getFullYear(), String(parsed.getMonth() + 1).padStart(2, "0"), String(parsed.getDate()).padStart(2, "0")].join("-");
}

export function nowDatetimeLocal(): string {
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const time = [String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0")].join(":");
  return joinDatetimeLocal(date, time);
}

export function durationLabel(start: string, end: string): string | null {
  if (!start || !end) return null;
  const difference = new Date(end).valueOf() - new Date(start).valueOf();
  if (!Number.isFinite(difference) || difference < 0) return null;
  const minutes = Math.round(difference / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} phút`;
  return remainder ? `${hours} giờ ${remainder} phút` : `${hours} giờ`;
}
