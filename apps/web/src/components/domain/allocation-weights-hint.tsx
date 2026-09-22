"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import type { EventSettings } from "@/types/api";

export function AllocationWeightsHint({
  eventId,
  kind,
}: {
  eventId: number;
  kind: "flight" | "bus";
}) {
  const { data } = useQuery({
    queryKey: ["events", eventId, "settings"],
    queryFn: () => apiFetch<EventSettings>(`/api/events/${eventId}/settings`),
  });
  const queryClient = useQueryClient();
  const [weights, setWeights] = useState<Record<string, number>>({});
  const source = kind === "flight" ? data?.flight_allocation_weights : data?.bus_allocation_weights;
  const currentWeights = Object.keys(weights).length > 0 ? weights : source ?? {};
  const save = useMutation({
    mutationFn: () =>
      apiFetch<EventSettings>(`/api/events/${eventId}/settings`, {
        method: "PUT",
        body: JSON.stringify(kind === "flight" ? { flight_allocation_weights: currentWeights } : { bus_allocation_weights: currentWeights }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["events", eventId, "settings"], updated);
      setWeights({});
      toast.success("Đã lưu trọng số mặc định cho phân bổ");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được trọng số"),
  });
  if (!data) return null;

  const line =
    kind === "flight"
      ? `Đúng ca ${data.flight_allocation_weights.same_shift}% · Cùng team ${data.flight_allocation_weights.team_together}% · Lấp đầy ${data.flight_allocation_weights.fill_rate}% · Phạt tách ${data.flight_allocation_weights.split_penalty}%`
      : `Cùng chuyến ${data.bus_allocation_weights.same_flight}% · Cùng team ${data.bus_allocation_weights.team_together}% · Lấp đầy ${data.bus_allocation_weights.fill_rate}%`;

  return (
    <details className="rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Trọng số mặc định đang dùng: {line}</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(currentWeights).map(([key, value]) => (
          <label key={key} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{key.replaceAll("_", " ")}</span>
            <Input
              type="number"
              min="0"
              step="1"
              className="h-8 w-20"
              value={value}
              onChange={(event) => setWeights((current) => ({ ...currentWeights, ...current, [key]: Number(event.target.value) }))}
            />
          </label>
        ))}
      </div>
      <Button className="mt-3 h-8" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        Lưu trọng số
      </Button>
    </details>
  );
}
