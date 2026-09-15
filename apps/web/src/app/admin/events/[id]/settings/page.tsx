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
import type { Event, EventSettings, Site } from "@/types/api";

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
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: () => apiFetch<Site[]>("/api/sites"),
  });

  if (!event || !settings) {
    return <p className="text-sm text-muted-foreground">Đang tải cấu hình...</p>;
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <nav className="hidden w-52 shrink-0 lg:sticky lg:top-6 lg:block" aria-label="Mục cấu hình">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">Mục cài đặt nhanh</p>
        <ul className="flex flex-col gap-1 text-sm">
          {[
            ["#su-kien", "Thông tin sự kiện"],
            ["#quy-dinh", "Quy định"],
            ["#ca-bay", "Ca đăng ký (nguyện vọng)"],
            ["#chang-xe", "Chặng xe"],
            ["#diem-don", "Điểm đón/trả"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="nav-link">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-[11px] leading-relaxed text-orange-900">
          Chiến lược Cân bằng / Đúng ca / Cùng đội được chọn ngay trước khi chạy phân bổ. Ca + chặng + điểm đón là dữ liệu CBNV chọn khi đăng ký.
        </p>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-8">
      <section id="su-kien" className="scroll-mt-6">
      <EventMetaForm key={event.id} event={event} />
      </section>
      <section id="quy-dinh" className="scroll-mt-6">
      <TermsWeightsForm key={`${settings.terms_version}-${JSON.stringify(settings.flight_allocation_weights)}`} eventId={eventId} settings={settings} />
      </section>
      <section id="ca-bay" className="scroll-mt-6 space-y-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Ca đăng ký (nguyện vọng bay)</h2>
          <p className="text-xs text-muted-foreground">
            CBNV chọn ca khi đăng ký. Chuyến bay gắn vào ca trên màn <strong>Chuyến bay</strong> — thuật toán ưu tiên đúng ca theo trọng số.
          </p>
        </div>
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
      </section>
      <section id="chang-xe" className="scroll-mt-6 space-y-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Chặng xe</h2>
          <p className="text-xs text-muted-foreground">
            CBNV tick nhu cầu theo từng chặng. Phân xe tự động chạy <em>từng chặng</em> với trọng số xe ở trên.
          </p>
        </div>
        <EntityCrudTable
          queryKey={["events", String(eventId), "transport-legs"]}
          label="chặng xe"
          basePath={`/api/events/${eventId}/transport-legs`}
          fields={[
            { name: "code", label: "Mã" },
            { name: "name", label: "Tên" },
            { name: "direction", label: "Chiều", options: [
              { value: "outbound", label: "Chiều đi" },
              { value: "inbound", label: "Chiều về" },
              { value: "local", label: "Di chuyển nội bộ" },
            ] },
            {
              name: "flight_timing",
              label: "Ràng buộc giờ bay",
              required: false,
              options: [
                { value: "before_flight", label: "Khởi hành trước chuyến bay" },
                { value: "after_flight", label: "Khởi hành sau khi hạ cánh" },
                { value: "none", label: "Không liên quan chuyến bay" },
              ],
            },
          ]}
        />
      </section>
      <section id="diem-don" className="scroll-mt-6 space-y-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Điểm đón / trả</h2>
          <p className="text-xs text-muted-foreground">
            Form đăng ký bắt chọn điểm khi tick cần xe. Xe gắn điểm đón trên màn Xe.
          </p>
        </div>
        <EntityCrudTable
          queryKey={["events", String(eventId), "pickup-points"]}
          label="điểm đón"
          basePath={`/api/events/${eventId}/pickup-points`}
          fields={[
            { name: "name", label: "Tên điểm" },
            { name: "site_id", label: "Địa điểm làm việc", options: (sites ?? []).map((site) => ({ value: String(site.id), label: `${site.code} · ${site.name}` })) },
            { name: "address", label: "Địa chỉ", required: false },
          ]}
        />
      </section>
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
  const saveSettings = useMutation({
    mutationFn: () =>
      apiFetch<EventSettings>(`/api/events/${eventId}/settings`, {
        method: "PUT",
        body: JSON.stringify({
          terms_text: termsText,
          terms_version: termsVersion,
        }),
      }),
    onSuccess: (updated) => {
      toast.success("Đã lưu quy định sự kiện");
      queryClient.setQueryData(["events", eventId, "settings"], updated);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quy định đăng ký</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="terms">Quy định sự kiện (CBNV phải đồng ý khi gửi đăng ký)</Label>
          <Textarea id="terms" rows={5} value={termsText} onChange={(e) => setTermsText(e.target.value)} />
        </div>
        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor="terms-ver">Phiên bản điều khoản</Label>
          <Input id="terms-ver" value={termsVersion} onChange={(e) => setTermsVersion(e.target.value)} />
        </div>

        <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Thuật toán dùng ba preset đã kiểm thử. BTC chọn preset tại màn Phân chuyến bay hoặc Phân xe trước mỗi lần chạy.
        </p>

        <div>
          <Button disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
            Lưu quy định
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
