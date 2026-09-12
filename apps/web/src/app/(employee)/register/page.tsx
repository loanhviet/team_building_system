"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/domain/empty-state";
import { ProfileCard } from "@/components/domain/profile-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import type {
  Event,
  EventTerms,
  PickupPoint,
  Registration,
  Shift,
  TransportLeg,
  TransportNeed,
} from "@/types/api";

export default function RegisterPage() {
  const { user } = useAuth();

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ["events", "current"],
    queryFn: () => apiFetch<Event | null>("/api/events/current"),
    enabled: !!user,
  });

  const eventId = event?.id;

  const { data: registration, isLoading: registrationLoading } = useQuery({
    queryKey: ["events", eventId, "registrations", "me"],
    queryFn: () => apiFetch<Registration>(`/api/events/${eventId}/registrations/me`),
    enabled: !!eventId,
  });

  const { data: shifts } = useQuery({
    queryKey: ["events", eventId, "shifts"],
    queryFn: () => apiFetch<Shift[]>(`/api/events/${eventId}/shifts`),
    enabled: !!eventId,
  });

  const { data: legs } = useQuery({
    queryKey: ["events", eventId, "transport-legs"],
    queryFn: () => apiFetch<TransportLeg[]>(`/api/events/${eventId}/transport-legs`),
    enabled: !!eventId,
  });

  const { data: pickupPoints } = useQuery({
    queryKey: ["events", eventId, "pickup-points"],
    queryFn: () => apiFetch<PickupPoint[]>(`/api/events/${eventId}/pickup-points`),
    enabled: !!eventId,
  });

  const { data: terms } = useQuery({
    queryKey: ["events", eventId, "terms"],
    queryFn: () => apiFetch<EventTerms>(`/api/events/${eventId}/terms`),
    enabled: !!eventId,
  });

  if (eventLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  if (!event) {
    return (
      <EmptyState
        title="Chưa mở đăng ký"
        description="Hiện chưa có sự kiện nào đang nhận đăng ký. Bạn sẽ nhận thông báo khi BTC mở cổng."
      />
    );
  }

  if (registrationLoading || !registration) {
    return <p className="text-sm text-muted-foreground">Đang tải form đăng ký...</p>;
  }

  if (registration.status === "cancelled") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <h1 className="font-display text-2xl">Đăng ký đã bị huỷ</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Liên hệ BTC nếu bạn muốn đăng ký lại.
        </p>
      </div>
    );
  }

  return (
    <RegistrationForm
      key={registration.id}
      event={event}
      registration={registration}
      shifts={shifts ?? []}
      legs={legs ?? []}
      pickupPoints={pickupPoints ?? []}
      terms={terms}
    />
  );
}

function RegistrationForm({
  event,
  registration,
  shifts,
  legs,
  pickupPoints,
  terms,
}: {
  event: Event;
  registration: Registration;
  shifts: Shift[];
  legs: TransportLeg[];
  pickupPoints: PickupPoint[];
  terms: EventTerms | undefined;
}) {
  const queryClient = useQueryClient();
  const eventId = event.id;

  const [isParticipating, setIsParticipating] = useState<boolean | null>(
    registration.is_participating,
  );
  const [shiftId, setShiftId] = useState<number | null>(registration.shift_id);
  const [wishNote, setWishNote] = useState(registration.wish_note ?? "");
  const [needs, setNeeds] = useState<Record<number, TransportNeed>>(() => {
    const byLeg: Record<number, TransportNeed> = {};
    for (const n of registration.transport_needs) byLeg[n.leg_id] = n;
    return byLeg;
  });
  const [agreed, setAgreed] = useState(
    registration.status === "submitted" && registration.is_participating === true,
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/events/${eventId}/registrations/me`, {
        method: "PUT",
        body: JSON.stringify({
          is_participating: isParticipating,
          shift_id: isParticipating ? shiftId : null,
          wish_note: wishNote || null,
          transport_needs: legs.map((leg) => ({
            leg_id: leg.id,
            is_needed: needs[leg.id]?.is_needed ?? false,
            pickup_point_id: needs[leg.id]?.pickup_point_id ?? null,
          })),
        }),
      });
      return apiFetch(`/api/events/${eventId}/registrations/me/submit`, {
        method: "POST",
        body: JSON.stringify({
          is_participating: isParticipating,
          agreed_terms: agreed,
          terms_version: terms?.terms_version ?? "v1",
        }),
      });
    },
    onSuccess: () => {
      toast.success("Đăng ký thành công. Kiểm tra email xác nhận.");
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "registrations", "me"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/events/${eventId}/registrations/me/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success("Đã huỷ đăng ký");
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "registrations", "me"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const canSubmit =
    isParticipating !== null && (!isParticipating || agreed) && !submitMutation.isPending;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="ticket-kicker">Đăng ký tham gia</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{event.name}</h1>
      </div>

      <ProfileCard editablePhone />

      {registration.status === "submitted" && (
        <div className="rounded-lg border border-primary/30 bg-primary/8 px-3 py-2 text-sm">
          Đã gửi lúc {formatDateTime(registration.submitted_at)}. Bạn vẫn sửa được trước khi BTC đóng
          đăng ký.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Xác nhận tham gia</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={isParticipating === true}
                onChange={() => setIsParticipating(true)}
              />
              Có tham gia
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={isParticipating === false}
                onChange={() => setIsParticipating(false)}
              />
              Không tham gia
            </label>
          </div>

          {isParticipating && (
            <>
              <div className="flex flex-col gap-2">
                <Label>Ca đăng ký</Label>
                <Select
                  value={shiftId ? String(shiftId) : undefined}
                  onValueChange={(v) => setShiftId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn ca" />
                  </SelectTrigger>
                  <SelectContent>
                    {shifts.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                        {s.depart_after_time ? ` (sau ${s.depart_after_time})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Đây là nguyện vọng. BTC phân bổ theo nguồn lực thực tế, không cam kết đáp ứng 100%.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Label>Nhu cầu xe đưa đón</Label>
                {legs.map((leg) => {
                  const need = needs[leg.id];
                  return (
                    <div key={leg.id} className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={need?.is_needed ?? false}
                          onChange={(e) =>
                            setNeeds((prev) => ({
                              ...prev,
                              [leg.id]: {
                                leg_id: leg.id,
                                is_needed: e.target.checked,
                                pickup_point_id: prev[leg.id]?.pickup_point_id ?? null,
                              },
                            }))
                          }
                        />
                        {leg.name}
                      </label>
                      {need?.is_needed && pickupPoints.length > 0 && (
                        <Select
                          value={need.pickup_point_id ? String(need.pickup_point_id) : undefined}
                          onValueChange={(v) =>
                            setNeeds((prev) => ({
                              ...prev,
                              [leg.id]: { ...prev[leg.id], pickup_point_id: Number(v) },
                            }))
                          }
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Điểm đón/trả" />
                          </SelectTrigger>
                          <SelectContent>
                            {pickupPoints.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="wish-note">Mong muốn/đề xuất</Label>
                <Textarea
                  id="wish-note"
                  value={wishNote}
                  onChange={(e) => setWishNote(e.target.value)}
                  placeholder="Bạn có mong muốn hoặc đề xuất gì cho kỳ Team Building lần này?"
                />
                <p className="text-xs text-muted-foreground">
                  BTC xem và xử lý thủ công. Hệ thống không cam kết đáp ứng.
                </p>
              </div>

              {terms && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <span>{terms.terms_text}</span>
                </label>
              )}
            </>
          )}

          <div className="flex gap-2">
            <Button disabled={!canSubmit} onClick={() => submitMutation.mutate()}>
              {registration.status === "submitted" ? "Cập nhật đăng ký" : "Gửi đăng ký"}
            </Button>
            {registration.status === "submitted" && (
              <Button
                variant="outline"
                disabled={cancelMutation.isPending}
                onClick={() => {
                  if (confirm("Bạn chắc chắn muốn huỷ đăng ký?")) cancelMutation.mutate();
                }}
              >
                Huỷ đăng ký
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
