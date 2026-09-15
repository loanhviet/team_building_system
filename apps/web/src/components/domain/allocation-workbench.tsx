"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AllocationPreflight, AllocationPreset } from "@/types/api";

export function AllocationPresetSelect({
  value,
  onChange,
}: {
  value: AllocationPreset;
  onChange: (value: AllocationPreset) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange((v ?? "balanced") as AllocationPreset)}>
      <SelectTrigger className="w-52" aria-label="Chiến lược phân bổ">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="balanced">Cân bằng</SelectItem>
        <SelectItem value="shift_first">Ưu tiên đúng ca/chuyến</SelectItem>
        <SelectItem value="team_first">Ưu tiên cùng đội</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function AllocationKpiStrip({
  items,
}: {
  items: { label: string; value: string | number; tone?: "default" | "warning" | "danger" }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-5" aria-label="Tổng quan phân bổ">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-card px-3 py-2">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p
            className={
              item.tone === "danger"
                ? "mt-0.5 text-xl font-semibold tabular-nums text-destructive"
                : item.tone === "warning"
                  ? "mt-0.5 text-xl font-semibold tabular-nums text-[var(--ember)]"
                  : "mt-0.5 text-xl font-semibold tabular-nums"
            }
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AllocationReadiness({ data }: { data?: AllocationPreflight }) {
  if (!data) return <p className="text-xs text-muted-foreground">Đang kiểm tra dữ liệu...</p>;
  if (data.ready && data.warnings.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="size-4" /> Dữ liệu sẵn sàng để phân bổ
      </p>
    );
  }
  const issues = [...data.blockers, ...data.warnings];
  return (
    <div className={data.ready ? "rounded-xl bg-amber-50 p-3 text-amber-900" : "rounded-xl bg-red-50 p-3 text-red-800"}>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <AlertTriangle className="size-4" />
        {data.ready ? "Có dữ liệu cần lưu ý" : "Cần hoàn thiện dữ liệu trước khi chạy"}
      </p>
      <ul className="mt-1 list-inside list-disc text-xs">
        {issues.map((item) => <li key={item.code}>{item.message}</li>)}
      </ul>
    </div>
  );
}
