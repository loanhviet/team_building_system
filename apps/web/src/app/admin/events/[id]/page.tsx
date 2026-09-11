"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityCrudTable } from "@/components/domain/entity-crud-table";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ALL_EVENT_STATUSES, EVENT_FORWARD_TRANSITIONS, EVENT_STATUS_LABELS } from "@/lib/event-status";
import type { Event, EventStatus } from "@/types/api";

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [forceStatus, setForceStatus] = useState<EventStatus | "">("");

  const { data: event, isLoading } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => apiFetch<Event>(`/api/events/${eventId}`),
  });

  const transitionMutation = useMutation({
    mutationFn: (status: EventStatus) =>
      apiFetch<Event>(`/api/events/${eventId}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (updated) => {
      toast.success(`Đã chuyển sang: ${EVENT_STATUS_LABELS[updated.status]}`);
      queryClient.setQueryData(["events", eventId], updated);
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setForceStatus("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  if (isLoading || !event) {
    return <p className="text-sm text-zinc-500">Đang tải...</p>;
  }

  const nextStatuses = EVENT_FORWARD_TRANSITIONS[event.status];
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-zinc-500">{event.code}</p>
        <h1 className="text-2xl font-semibold">{event.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Trạng thái: <Badge variant="outline">{EVENT_STATUS_LABELS[event.status]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {nextStatuses.map((status) => (
            <Button
              key={status}
              size="sm"
              onClick={() => transitionMutation.mutate(status)}
              disabled={transitionMutation.isPending}
            >
              Chuyển sang: {EVENT_STATUS_LABELS[status]}
            </Button>
          ))}
          {nextStatuses.length === 0 && (
            <p className="text-sm text-zinc-500">Không còn bước tiếp theo trong luồng chuẩn.</p>
          )}

          {isSuperAdmin && (
            <div className="ml-auto flex items-center gap-2">
              <Select value={forceStatus} onValueChange={(v) => setForceStatus(v as EventStatus)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Ghi đè trạng thái (Super Admin)" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_EVENT_STATUSES.filter((s) => s !== event.status).map((s) => (
                    <SelectItem key={s} value={s}>
                      {EVENT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={!forceStatus || transitionMutation.isPending}
                onClick={() => forceStatus && transitionMutation.mutate(forceStatus)}
              >
                Ghi đè
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-lg font-medium">Ca bay</h2>
        <EntityCrudTable
          queryKey={["events", String(eventId), "shifts"]}
          label="ca bay"
          basePath={`/api/events/${eventId}/shifts`}
          fields={[
            { name: "code", label: "Mã" },
            { name: "name", label: "Tên" },
            { name: "depart_after_time", label: "Sau giờ (HH:MM)", required: false },
          ]}
        />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-medium">Chặng xe</h2>
        <EntityCrudTable
          queryKey={["events", String(eventId), "transport-legs"]}
          label="chặng xe"
          basePath={`/api/events/${eventId}/transport-legs`}
          fields={[
            { name: "code", label: "Mã" },
            { name: "name", label: "Tên" },
            { name: "direction", label: "Chiều di chuyển" },
          ]}
        />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-medium">Điểm đón/trả</h2>
        <EntityCrudTable
          queryKey={["events", String(eventId), "pickup-points"]}
          label="điểm đón"
          basePath={`/api/events/${eventId}/pickup-points`}
          fields={[
            { name: "name", label: "Tên điểm" },
            { name: "address", label: "Địa chỉ", required: false },
          ]}
        />
      </div>
    </div>
  );
}
