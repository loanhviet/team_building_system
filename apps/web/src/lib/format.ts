export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN");
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("vi-VN");
  }
  return new Date(value).toLocaleDateString("vi-VN");
}

export const ROLE_LABEL: Record<string, string> = {
  employee: "CBNV",
  team_leader: "Trưởng nhóm",
  organizer: "BTC",
  super_admin: "Super Admin",
};
