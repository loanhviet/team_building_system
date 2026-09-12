export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 16);
}

export function fromDatetimeLocal(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
