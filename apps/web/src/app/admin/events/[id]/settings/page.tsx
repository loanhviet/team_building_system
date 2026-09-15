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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <nav className="hidden w-52 shrink-0 lg:sticky lg:top-6 lg:block" aria-label="Mục cấu hình">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">Mục cài đặt nhanh</p>
        <ul className="flex flex-col gap-1 text-sm">
          {[
            ["#su-kien", "Thông tin sự kiện"],
            ["#quy-dinh", "Quy định & trọng số"],
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
          Trọng số bay/xe ở đây là đầu vào của <strong>Chạy phân bổ tự động</strong> trên màn Chuyến bay và Xe. Ca + chặng + điểm đón là dữ liệu CBNV chọn khi đăng ký.
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
            { name: "direction", label: "Chiều (outbound/inbound/local)" },
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
  const [weights, setWeights] = useState({
    same_shift: settings.flight_allocation_weights.same_shift,
    team_together: settings.flight_allocation_weights.team_together,
    fill_rate: settings.flight_allocation_weights.fill_rate,
    split_penalty: settings.flight_allocation_weights.split_penalty,
  });
  const [busWeights, setBusWeights] = useState({
    same_flight: settings.bus_allocation_weights?.same_flight ?? 50,
    team_together: settings.bus_allocation_weights?.team_together ?? 30,
    fill_rate: settings.bus_allocation_weights?.fill_rate ?? 20,
  });

  const flightTotal = weights.same_shift + weights.team_together + weights.fill_rate + weights.split_penalty;
  const busTotal = busWeights.same_flight + busWeights.team_together + busWeights.fill_rate;

  const saveSettings = useMutation({
    mutationFn: () =>
      apiFetch<EventSettings>(`/api/events/${eventId}/settings`, {
        method: "PUT",
        body: JSON.stringify({
          terms_text: termsText,
          terms_version: termsVersion,
          flight_allocation_weights: weights,
          bus_allocation_weights: busWeights,
        }),
      }),
    onSuccess: (updated) => {
      toast.success("Đã lưu quy định và trọng số — lần chạy phân bổ tiếp theo sẽ dùng bộ này");
      queryClient.setQueryData(["events", eventId, "settings"], updated);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  const resetFlight = () => setWeights({ same_shift: 40, team_together: 30, fill_rate: 20, split_penalty: 10 });
  const resetBus = () => setBusWeights({ same_flight: 50, team_together: 30, fill_rate: 20 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quy định &amp; trọng số thuật toán phân bổ</CardTitle>
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

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Trọng số phân chuyến bay</p>
              <p className="text-xs text-muted-foreground">
                Dùng khi bấm “Chạy phân bổ tự động” trên màn Chuyến bay. Phạt tách: số người sai ca cho phép giữ nguyên team = phạt ÷ đúng ca.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={resetFlight}>
              Đặt lại mặc định
            </Button>
          </div>
          <WeightRow label="1. Đúng ca mong muốn" hint="Ưu tiên chuyến khớp ca CBNV đã đăng ký" value={weights.same_shift} onChange={(v) => setWeights((p) => ({ ...p, same_shift: v }))} />
          <WeightRow label="2. Đi cùng Team" hint="Ưu tiên chuyến đã có đồng đội" value={weights.team_together} onChange={(v) => setWeights((p) => ({ ...p, team_together: v }))} />
          <WeightRow label="3. Lấp đầy ghế" hint="Ưu tiên chuyến đang dùng dở" value={weights.fill_rate} onChange={(v) => setWeights((p) => ({ ...p, fill_rate: v }))} />
          <WeightRow label="4. Phạt tách Team" hint="Cao = giữ team dù lệch ca; thấp = tách để đúng ca" value={weights.split_penalty} onChange={(v) => setWeights((p) => ({ ...p, split_penalty: v }))} warn />
          <p className={`mt-2 text-xs font-semibold ${Math.abs(flightTotal - 100) < 0.5 ? "text-emerald-700" : "text-[var(--ember)]"}`}>
            Tổng {flightTotal}% {Math.abs(flightTotal - 100) < 0.5 ? "— tỷ lệ tương đối ổn" : "— nên chỉnh về 100% cho dễ đọc (thuật toán dùng tỷ lệ, không bắt buộc)"}
          </p>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Trọng số phân xe</p>
              <p className="text-xs text-muted-foreground">
                Dùng khi bấm “Chạy phân xe tự động” trên màn Xe, theo từng chặng đã cấu hình.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={resetBus}>
              Đặt lại mặc định
            </Button>
          </div>
          <WeightRow label="Cùng chuyến bay" hint="Người cùng flight ưu tiên lên một xe" value={busWeights.same_flight} onChange={(v) => setBusWeights((p) => ({ ...p, same_flight: v }))} />
          <WeightRow label="Cùng Team" hint="Xe đã có đồng đội được ưu tiên" value={busWeights.team_together} onChange={(v) => setBusWeights((p) => ({ ...p, team_together: v }))} />
          <WeightRow label="Lấp đầy xe" hint="Ưu tiên xe còn vừa nhóm" value={busWeights.fill_rate} onChange={(v) => setBusWeights((p) => ({ ...p, fill_rate: v }))} />
          <p className={`mt-2 text-xs font-semibold ${Math.abs(busTotal - 100) < 0.5 ? "text-emerald-700" : "text-[var(--ember)]"}`}>
            Tổng {busTotal}%
          </p>
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

function WeightRow({
  label,
  hint,
  value,
  onChange,
  warn,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  warn?: boolean;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span className={`tabular text-sm font-bold ${warn ? "text-[var(--ember)]" : "text-primary"}`}>{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--lagoon)]"
      />
    </div>
  );
}
