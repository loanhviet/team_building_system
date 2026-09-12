"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { toast } from "sonner";
import { EntityCrudTable } from "@/components/domain/entity-crud-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/datetime";
import type { Event, EventSettings } from "@/types/api";

export default function EventSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);

  const { data: event } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => apiFetch<Event>(`/api/events/${eventId}`),
  });
  const { data: settings } = useQuery({
    queryKey: ["events", eventId, "settings"],
    queryFn: () => apiFetch<EventSettings>(`/api/events/${eventId}/settings`),
  });

  if (!event || !settings) {
    return <p className="text-sm text-muted-foreground">Đang tải cấu hình...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <EventMetaForm key={event.id} event={event} />
      <TermsWeightsForm key={settings.terms_version} eventId={eventId} settings={settings} />
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

function EventMetaForm({ event }: { event: Event }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(event.name);
  const [destination, setDestination] = useState(event.destination ?? "");
  const [description, setDescription] = useState(event.description ?? "");
  const [startDate, setStartDate] = useState(event.start_date ?? "");
  const [endDate, setEndDate] = useState(event.end_date ?? "");
  const [openAt, setOpenAt] = useState(toDatetimeLocal(event.registration_open_at));
  const [closeAt, setCloseAt] = useState(toDatetimeLocal(event.registration_close_at));

  const saveEvent = useMutation({
    mutationFn: () =>
      apiFetch<Event>(`/api/events/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          destination: destination || null,
          description: description || null,
          start_date: startDate || null,
          end_date: endDate || null,
          registration_open_at: fromDatetimeLocal(openAt),
          registration_close_at: fromDatetimeLocal(closeAt),
        }),
      }),
    onSuccess: (updated) => {
      toast.success("Đã lưu thông tin sự kiện");
      queryClient.setQueryData(["events", event.id], updated);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Thông tin sự kiện</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="ev-name">Tên</Label>
          <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-dest">Điểm đến</Label>
          <Input id="ev-dest" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-start">Ngày bắt đầu</Label>
          <Input id="ev-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-end">Ngày kết thúc</Label>
          <Input id="ev-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-open">Mở đăng ký</Label>
          <Input id="ev-open" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-close">Đóng đăng ký</Label>
          <Input id="ev-close" type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="ev-desc">Mô tả</Label>
          <Textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Button disabled={!name || saveEvent.isPending} onClick={() => saveEvent.mutate()}>
            Lưu sự kiện
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TermsWeightsForm({ eventId, settings }: { eventId: number; settings: EventSettings }) {
  const queryClient = useQueryClient();
  const [termsText, setTermsText] = useState(settings.terms_text);
  const [termsVersion, setTermsVersion] = useState(settings.terms_version);
  const [weights, setWeights] = useState({
    same_shift: settings.flight_allocation_weights.same_shift,
    team_together: settings.flight_allocation_weights.team_together,
    fill_rate: settings.flight_allocation_weights.fill_rate,
    split_penalty: settings.flight_allocation_weights.split_penalty,
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      apiFetch<EventSettings>(`/api/events/${eventId}/settings`, {
        method: "PUT",
        body: JSON.stringify({
          terms_text: termsText,
          terms_version: termsVersion,
          flight_allocation_weights: weights,
        }),
      }),
    onSuccess: (updated) => {
      toast.success("Đã lưu quy định và trọng số");
      queryClient.setQueryData(["events", eventId, "settings"], updated);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quy định đăng ký &amp; trọng số phân bổ</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="terms">Nội dung xác nhận quy định</Label>
          <Textarea id="terms" rows={4} value={termsText} onChange={(e) => setTermsText(e.target.value)} />
        </div>
        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor="terms-ver">Phiên bản</Label>
          <Input id="terms-ver" value={termsVersion} onChange={(e) => setTermsVersion(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {(
            [
              ["same_shift", "Đúng ca"],
              ["team_together", "Đi cùng Team"],
              ["fill_rate", "Lấp đầy chuyến"],
              ["split_penalty", "Phạt tách Team"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`w-${key}`}>{label}</Label>
              <Input
                id={`w-${key}`}
                type="number"
                value={weights[key]}
                onChange={(e) => setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>
        <div>
          <Button disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
            Lưu quy định &amp; trọng số
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
