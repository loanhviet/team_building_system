"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, ClipboardCheck, Plane, UserCheck } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/domain/callout";
import { ChoiceCard } from "@/components/domain/form-field";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { PageHeader } from "@/components/domain/page-header";
import { PageSkeleton } from "@/components/domain/page-skeleton";
import { ProfileCard } from "@/components/domain/profile-card";
import { StepIndicator } from "@/components/domain/step-indicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useEmployeeEvent } from "@/lib/use-employee-event";
import type {
  Employee,
  Event,
  EventTerms,
  PickupPoint,
  Registration,
  Shift,
  TransportLeg,
  TransportNeed,
} from "@/types/api";

function SectionTitle({
  step,
  icon: Icon,
  children,
}: {
  step: number;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <CardTitle className="flex items-center gap-2 text-base">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
        {step}
      </span>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {children}
    </CardTitle>
  );
}

export default function RegisterPage() {
  const { user } = useAuth();
  const { event, eventId, canRegister, isLoading: eventLoading } = useEmployeeEvent();
  const isOpenForEditing = canRegister;

  // The scoped endpoint auto-creates a draft row — only call it while
  // registration is actually open. Once closed, `latestReg` (already fetched
  // above) is the registration to show, read-only.
  const {
    data: registration,
    isLoading: registrationLoading,
    error: registrationError,
  } = useQuery({
    queryKey: ["events", eventId, "registrations", "me", isOpenForEditing],
    queryFn: () =>
      isOpenForEditing
        ? apiFetch<Registration>(`/api/events/${eventId}/registrations/me`)
        : apiFetch<Registration | null>(`/api/registrations/me?event_id=${eventId}`),
    enabled: !!eventId,
  });

  const { data: employee } = useQuery({
    queryKey: ["employees", "me"],
    queryFn: () => apiFetch<Employee>("/api/employees/me"),
    enabled: !!user,
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

  const { data: terms, error: termsError } = useQuery({
    queryKey: ["events", eventId, "terms"],
    queryFn: () => apiFetch<EventTerms>(`/api/events/${eventId}/terms`),
    enabled: !!eventId && isOpenForEditing,
  });

  const isLoading = eventLoading;

  if (isLoading) {
    return <PageSkeleton rows={3} />;
  }

  if (!event) {
    return (
      <EmptyState
        title="Chưa mở đăng ký"
        description="Hiện chưa có sự kiện nào đang nhận đăng ký. Bạn sẽ nhận thông báo khi BTC mở cổng."
      />
    );
  }

  const effectiveRegistration = registration ?? null;

  if (isOpenForEditing && registrationError) {
    return (
      <EmptyState
        variant="error"
        title="Không tải được form đăng ký"
        description={registrationError instanceof ApiError ? registrationError.message : undefined}
      />
    );
  }

  if (isOpenForEditing && (registrationLoading || !registration)) {
    return <PageSkeleton rows={3} />;
  }

  if (!effectiveRegistration) {
    return (
      <EmptyState
        title="Chưa mở đăng ký"
        description="Hiện chưa có sự kiện nào đang nhận đăng ký. Bạn sẽ nhận thông báo khi BTC mở cổng."
      />
    );
  }

  if (effectiveRegistration.status === "cancelled") {
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
      key={`${effectiveRegistration.id}-${isOpenForEditing}`}
      event={event}
      registration={effectiveRegistration}
      shifts={shifts ?? []}
      legs={legs ?? []}
      pickupPoints={pickupPoints ?? []}
      terms={terms}
      termsError={!!termsError}
      employeeSiteId={employee?.site_id ?? null}
      employeePhone={employee?.phone ?? user?.phone ?? ""}
      readOnly={!isOpenForEditing}
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
  termsError,
  employeeSiteId,
  employeePhone,
  readOnly,
}: {
  event: Event;
  registration: Registration;
  shifts: Shift[];
  legs: TransportLeg[];
  pickupPoints: PickupPoint[];
  terms: EventTerms | undefined;
  termsError: boolean;
  employeeSiteId: number | null;
  employeePhone: string;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const eventId = event.id;

  const [isParticipating, setIsParticipating] = useState<boolean | null>(
    registration.is_participating,
  );
  const [shiftId, setShiftId] = useState<number | null>(registration.shift_id);
  const [phone, setPhone] = useState(employeePhone);
  const [wishNote, setWishNote] = useState(registration.wish_note ?? "");
  const [needs, setNeeds] = useState<Record<number, TransportNeed>>(() => {
    const byLeg: Record<number, TransportNeed> = {};
    for (const n of registration.transport_needs) byLeg[n.leg_id] = n;
    return byLeg;
  });
  // Never auto-tick agreement across a terms_version the CBNV hasn't actually
  // seen and accepted — only pre-check when they submitted under the exact
  // version currently in force.
  const [agreed, setAgreed] = useState(
    registration.status === "submitted" &&
      registration.is_participating === true &&
      !!terms &&
      registration.terms_version === terms.terms_version,
  );
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { user } = useAuth();

  type StepId = "profile" | "join" | "shift" | "transport" | "review";
  const flow: { id: StepId; label: string }[] =
    isParticipating === false
      ? [
          { id: "profile", label: "Hồ sơ" },
          { id: "join", label: "Tham gia" },
          { id: "review", label: "Xem lại" },
        ]
      : [
          { id: "profile", label: "Hồ sơ" },
          { id: "join", label: "Tham gia" },
          { id: "shift", label: "Ca bay" },
          { id: "transport", label: "Xe đưa đón" },
          { id: "review", label: "Xem lại" },
        ];
  const currentStep = flow[Math.min(step, flow.length - 1)];
  const stepNumOf = (id: StepId) => flow.findIndex((s) => s.id === id) + 1;

  const outboundLegs = legs.filter((l) => l.direction === "outbound");
  const inboundLegs = legs.filter((l) => l.direction === "inbound");
  const otherLegs = legs.filter((l) => l.direction !== "outbound" && l.direction !== "inbound");
  const sitePickupPoints = employeeSiteId
    ? pickupPoints.filter((p) => p.site_id === employeeSiteId)
    : pickupPoints;

  const needsSelectionValid = legs.every((leg) => {
    const need = needs[leg.id];
    return !need?.is_needed || !!need.pickup_point_id;
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (phone.trim() && phone.trim() !== employeePhone) {
        await apiFetch("/api/employees/me", {
          method: "PATCH",
          body: JSON.stringify({ phone: phone.trim() }),
        });
      }
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
      setSubmitError(null);
      setJustSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "registrations", "me"] });
      queryClient.invalidateQueries({ queryKey: ["registrations", "me", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["employees", "me"] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Có lỗi xảy ra";
      setSubmitError(msg);
      toast.error(msg);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) =>
      apiFetch(`/api/events/${eventId}/registrations/me/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || null }),
      }),
    onSuccess: () => {
      toast.success("Đã huỷ đăng ký");
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "registrations", "me"] });
      queryClient.invalidateQueries({ queryKey: ["registrations", "me", "latest"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const canSubmit =
    !readOnly &&
    isParticipating !== null &&
    (!isParticipating ||
      (agreed && shiftId !== null && phone.trim() !== "" && needsSelectionValid)) &&
    !submitMutation.isPending;

  const stepBlockedReason = (): string | null => {
    if (!currentStep) return null;
    if (currentStep.id === "join" && isParticipating === null) return "Chọn Có hoặc Không tham gia.";
    if (currentStep.id === "join" && isParticipating && !agreed) return "Cần đồng ý quy định chương trình.";
    if (currentStep.id === "join" && isParticipating && termsError) return "Không tải được quy định.";
    if (currentStep.id === "shift" && shiftId === null) return "Chọn ca đăng ký (nguyện vọng).";
    if (currentStep.id === "transport" && !needsSelectionValid) {
      return "Mỗi chặng cần xe phải chọn điểm đón/trả.";
    }
    if (currentStep.id === "review" && isParticipating && phone.trim() === "") {
      return "Nhập số điện thoại ở bước Hồ sơ.";
    }
    return null;
  };

  if (justSubmitted) {
    const chosenShift = shifts.find((s) => s.id === shiftId);
    const chosenLegs = legs.filter((l) => needs[l.id]?.is_needed);
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <h1 className="font-display text-3xl font-semibold">Đăng ký thành công!</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Đã gửi email xác nhận tới {user?.email ?? "email công ty của bạn"}.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tóm tắt đăng ký</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Tham gia:</span>{" "}
              {isParticipating ? "Có tham gia" : "Không tham gia"}
            </p>
            {isParticipating && (
              <>
                <p>
                  <span className="text-muted-foreground">Ca đăng ký:</span>{" "}
                  {chosenShift?.name ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Nhu cầu xe:</span>{" "}
                  {chosenLegs.length > 0 ? chosenLegs.map((l) => l.name).join(", ") : "Không có"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Button variant="outline" onClick={() => setJustSubmitted(false)}>
          Xem lại / chỉnh sửa
        </Button>
      </div>
    );
  }

  const show = (id: StepId) => readOnly || currentStep?.id === id;
  const blocked = stepBlockedReason();
  const chosenShift = shifts.find((s) => s.id === shiftId);
  const chosenLegs = legs.filter((l) => needs[l.id]?.is_needed);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Phiếu đăng ký tham gia"
        description={
          event.registration_close_at && !readOnly
            ? `${event.name} · Hạn chỉnh sửa: ${formatDateTime(event.registration_close_at)}`
            : event.name
        }
      />

      {readOnly && (
        <Callout tone="info">
          BTC đã đóng đăng ký. Đây là thông tin bạn đã gửi — liên hệ BTC nếu cần thay đổi.
        </Callout>
      )}

      {registration.status === "submitted" && !readOnly && (
        <Callout tone="ok">
          Đã gửi lúc {formatDateTime(registration.submitted_at)}.
          {event.registration_close_at
            ? ` Bạn có thể sửa đến ${formatDateTime(event.registration_close_at)}.`
            : " Bạn vẫn sửa được trước khi BTC đóng đăng ký."}
        </Callout>
      )}

      {!readOnly && <StepIndicator steps={flow.map((s) => s.label)} current={Math.min(step, flow.length - 1)} />}

      {submitError && (
        <div id="register-error-summary" tabIndex={-1}>
          <Callout tone="danger" title="Không gửi được đăng ký">
            {submitError}
          </Callout>
        </div>
      )}

      <div key={readOnly ? "review-all" : currentStep?.id} className="flex animate-in flex-col gap-4 fade-in slide-in-from-right-2 duration-200">
      {show("profile") && (
        <ProfileCard
          step={stepNumOf("profile")}
          controlledPhone={readOnly ? undefined : { value: phone, onChange: setPhone }}
        />
      )}

      {show("join") && (
        <Card>
          <CardHeader>
            <SectionTitle step={stepNumOf("join")} icon={UserCheck}>
              Bạn có tham gia không?
            </SectionTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <ChoiceCard
                selected={isParticipating === true}
                title="Có, tôi tham gia"
                hint="Sẽ chọn ca và nhu cầu xe ở bước sau"
                disabled={readOnly}
                onClick={() => setIsParticipating(true)}
              />
              <ChoiceCard
                selected={isParticipating === false}
                title="Không tham gia"
                hint="BTC ghi nhận, không phân bổ nguồn lực"
                disabled={readOnly}
                onClick={() => setIsParticipating(false)}
              />
            </div>
            {isParticipating && !readOnly && terms && (
              <div className="flex flex-col gap-2">
                <div className="max-h-40 overflow-auto rounded-xl border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                  {terms.terms_text}
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <Checkbox
                    checked={agreed}
                    onCheckedChange={(checked) => setAgreed(checked === true)}
                  />
                  Tôi đã đọc và đồng ý quy định
                </label>
              </div>
            )}
            {isParticipating && !readOnly && !terms && termsError && (
              <EmptyState
                variant="error"
                title="Không tải được quy định chương trình"
                description="Vui lòng tải lại trang. Bạn cần đọc và đồng ý quy định trước khi gửi đăng ký."
              />
            )}
          </CardContent>
        </Card>
      )}

      {show("shift") && isParticipating && (
        <Card>
          <CardHeader>
            <SectionTitle step={stepNumOf("shift")} icon={Plane}>
              Ca đăng ký
            </SectionTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Nguyện vọng ca bay — BTC phân bổ theo slot thật, không cam kết 100%.
            </p>
            <div className="flex flex-col gap-2">
              {shifts.map((s) => (
                <ChoiceCard
                  key={s.id}
                  selected={shiftId === s.id}
                  title={s.name}
                  hint={s.depart_after_time ? `Khởi hành sau ${s.depart_after_time}` : undefined}
                  disabled={readOnly}
                  onClick={() => setShiftId(s.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {show("transport") && isParticipating && (
        <Card>
          <CardHeader>
            <SectionTitle step={stepNumOf("transport")} icon={Bus}>
              Nhu cầu xe
            </SectionTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {outboundLegs.length > 0 && (
              <TransportLegGroup
                title="Chiều đi"
                legs={outboundLegs}
                needs={needs}
                setNeeds={setNeeds}
                pickupPoints={sitePickupPoints}
                disabled={readOnly}
              />
            )}
            {inboundLegs.length > 0 && (
              <TransportLegGroup
                title="Chiều về"
                legs={inboundLegs}
                needs={needs}
                setNeeds={setNeeds}
                pickupPoints={sitePickupPoints}
                disabled={readOnly}
              />
            )}
            {otherLegs.length > 0 && (
              <TransportLegGroup
                title="Chặng khác"
                legs={otherLegs}
                needs={needs}
                setNeeds={setNeeds}
                pickupPoints={sitePickupPoints}
                disabled={readOnly}
              />
            )}
            {legs.length === 0 && (
              <p className="text-sm text-muted-foreground">BTC chưa cấu hình chặng xe cho sự kiện này.</p>
            )}
          </CardContent>
        </Card>
      )}

      {show("review") && (
        <Card>
          <CardHeader>
            <SectionTitle step={stepNumOf("review")} icon={ClipboardCheck}>
              {readOnly ? "Thông tin đã gửi" : "Xem lại & gửi"}
            </SectionTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-sm">
              <p>
                <span className="text-muted-foreground">Tham gia:</span>{" "}
                {isParticipating ? "Có tham gia" : isParticipating === false ? "Không tham gia" : "—"}
              </p>
              {isParticipating && (
                <>
                  <p>
                    <span className="text-muted-foreground">Ca:</span> {chosenShift?.name ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Xe:</span>{" "}
                    {chosenLegs.length > 0 ? chosenLegs.map((l) => l.name).join(", ") : "Không đăng ký xe"}
                  </p>
                </>
              )}
            </div>
            {isParticipating && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="wish-note">Mong muốn/đề xuất</Label>
                <Textarea
                  id="wish-note"
                  value={wishNote}
                  onChange={(e) => setWishNote(e.target.value)}
                  placeholder="Bạn có mong muốn hoặc đề xuất gì cho kỳ Team Building lần này?"
                  disabled={readOnly}
                />
                <p className="text-xs text-muted-foreground">
                  BTC xem và xử lý thủ công. Hệ thống không cam kết đáp ứng.
                </p>
              </div>
            )}
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" disabled={!canSubmit} onClick={() => submitMutation.mutate()}>
                  {registration.status === "submitted" ? "Cập nhật đăng ký" : "Gửi đăng ký"}
                </Button>
                {registration.status === "submitted" && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" className="min-h-11" disabled={cancelMutation.isPending}>
                        Huỷ đăng ký
                      </Button>
                    }
                    title="Huỷ đăng ký?"
                    description={
                      <div className="flex flex-col gap-2 pt-2 text-left">
                        <p>Hành động này cần liên hệ BTC nếu bạn muốn đăng ký lại sau đó.</p>
                        <Label htmlFor="cancel-reason">Lý do (không bắt buộc)</Label>
                        <Textarea
                          id="cancel-reason"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Cho BTC biết lý do bạn huỷ..."
                        />
                      </div>
                    }
                    confirmLabel="Huỷ đăng ký"
                    destructive
                    onConfirm={() => cancelMutation.mutate(cancelReason)}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Quay lại
          </Button>
          {currentStep?.id !== "review" && (
            <Button
              type="button"
              className="min-h-11"
              disabled={!!blocked}
              onClick={() => setStep((s) => Math.min(flow.length - 1, s + 1))}
            >
              Tiếp tục
            </Button>
          )}
          {blocked && <p className="text-sm text-destructive">{blocked}</p>}
        </div>
      )}
    </div>
    <aside className="hidden lg:sticky lg:top-24 lg:block">
      <div className="surface-card p-4">
        <p className="text-xs font-semibold text-muted-foreground">Tóm tắt đăng ký</p>
        {!readOnly && (
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tiến trình</span>
              <span>
                {Math.min(step, flow.length - 1) + 1}/{flow.length} bước
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{
                  width: `${((Math.min(step, flow.length - 1) + 1) / flow.length) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Tham gia</dt>
            <dd className="font-medium">
              {isParticipating ? "Có tham gia" : isParticipating === false ? "Không tham gia" : "Chưa chọn"}
            </dd>
          </div>
          {isParticipating && (
            <>
              <div>
                <dt className="text-muted-foreground">Ca</dt>
                <dd className="font-medium">{chosenShift?.name ?? "Chưa chọn"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Xe</dt>
                <dd className="font-medium">
                  {chosenLegs.length > 0 ? chosenLegs.map((l) => l.name).join(", ") : "Không đăng ký xe"}
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>
    </aside>
    </div>
  );
}

function TransportLegGroup({
  title,
  legs,
  needs,
  setNeeds,
  pickupPoints,
  disabled,
}: {
  title: string;
  legs: TransportLeg[];
  needs: Record<number, TransportNeed>;
  setNeeds: React.Dispatch<React.SetStateAction<Record<number, TransportNeed>>>;
  pickupPoints: PickupPoint[];
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Label>Nhu cầu xe đưa đón — {title}</Label>
      {legs.map((leg) => {
        const need = needs[leg.id];
        const missingPickup = need?.is_needed && !need.pickup_point_id;
        return (
          <div key={leg.id} className="rounded-xl border border-border bg-card p-3">
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={need?.is_needed ?? false}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  setNeeds((prev) => ({
                    ...prev,
                    [leg.id]: {
                      leg_id: leg.id,
                      is_needed: checked === true,
                      pickup_point_id: prev[leg.id]?.pickup_point_id ?? null,
                    },
                  }))
                }
              />
              Cần xe: {leg.name}
            </label>
            {need?.is_needed && (
              <div className="mt-2 pl-6">
                <Select
                  value={need.pickup_point_id ? String(need.pickup_point_id) : undefined}
                  onValueChange={(v) =>
                    setNeeds((prev) => ({
                      ...prev,
                      [leg.id]: { ...prev[leg.id], pickup_point_id: Number(v) },
                    }))
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="min-h-11">
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
                {pickupPoints.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">BTC chưa cấu hình điểm đón</p>
                )}
                {missingPickup && (
                  <p className="mt-1 text-xs text-destructive">Chọn điểm đón trước khi gửi</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
