"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bus,
  CalendarDays,
  Check,
  Circle,
  Hotel,
  MapPin,
  MessageCircle,
  PartyPopper,
  Phone,
  Plane,
  ScrollText,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/domain/empty-state";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { LiteMarkdown } from "@/components/domain/lite-markdown";
import { PageSkeleton } from "@/components/domain/page-skeleton";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDate, parseEventDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { useEmployeeEvent } from "@/lib/use-employee-event";
import {
  buildJourneyStages,
  firstUpcomingAt,
  galaTableLabel,
  isGalaSelectable,
  journeyGaps,
  journeyNext,
  type JourneyStage,
  type StageStatus,
} from "@/lib/journey-view";
import { cn } from "@/lib/utils";
import type { Journey, TeamRoster } from "@/types/api";

const KIND_ICON = {
  flight: Plane,
  bus: Bus,
  hotel: Hotel,
  gala: PartyPopper,
  program: ScrollText,
};

const STATUS_TONE: Record<StageStatus, string> = {
  confirmed: "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]",
  waiting: "bg-[#FFF7ED] text-[#C2410C] border-[#FFEDD5]",
  upcoming: "bg-slate-100 text-slate-600 border-slate-200",
  action: "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]",
  pending: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function JourneyPage() {
  const { user } = useAuth();
  const { eventId, eventName, event, canRegister, hasJourney, isLeader } = useEmployeeEvent();
  const [dayKey, setDayKey] = useState<string>("all");

  const {
    data: journey,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["journey", "me", eventId],
    queryFn: () => apiFetch<Journey>(`/api/journey/me?event_id=${eventId}`),
    enabled: !!user && !!eventId && hasJourney,
    retry: false,
  });

  const { data: roster } = useQuery({
    queryKey: ["events", eventId, "team", "roster"],
    queryFn: () => apiFetch<TeamRoster>(`/api/events/${eventId}/team/roster`),
    enabled: !!eventId && isLeader,
    retry: false,
  });

  if (!eventId) {
    return (
      <EmptyState
        title="Chưa có kỳ nào"
        description="Khi BTC mở đăng ký, kỳ sẽ xuất hiện ở thanh điều hướng."
      />
    );
  }

  if (!hasJourney) {
    return (
      <EmptyState
        title={eventName ?? "Hành trình chưa có"}
        description={
          canRegister
            ? "Kỳ này đang mở đăng ký. Hành trình hiện sau khi BTC công bố thông tin."
            : "BTC chưa công bố hành trình cho kỳ này."
        }
        action={
          canRegister ? (
            <Link href="/register" className="text-sm text-primary underline">
              Đi tới đăng ký
            </Link>
          ) : undefined
        }
      />
    );
  }

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const isNotPublished = error instanceof ApiError && error.code === "no_published_event";
    return (
      <EmptyState
        variant={isNotPublished ? "empty" : "error"}
        title={isNotPublished ? "Hành trình chưa được công bố" : "Không tải được hành trình"}
        description={
          isNotPublished
            ? "BTC chưa công bố thông tin cho sự kiện bạn đăng ký, hoặc bạn chưa đăng ký tham gia."
            : error instanceof ApiError
              ? error.message
              : undefined
        }
        onRetry={!isNotPublished ? () => refetch() : undefined}
        action={
          isNotPublished ? (
            <Link href="/register" className="text-sm text-primary underline">
              Đi tới đăng ký
            </Link>
          ) : undefined
        }
      />
    );
  }

  if (!journey) return null;

  return (
    <JourneyCanvas
      journey={journey}
      userName={user?.full_name ?? journey.full_name}
      userCode={user?.employee_code ?? journey.employee_code}
      event={event}
      dayKey={dayKey}
      setDayKey={setDayKey}
      roster={roster}
      isLeader={isLeader}
    />
  );
}

function JourneyCanvas({
  journey,
  userName,
  userCode,
  event,
  dayKey,
  setDayKey,
  roster,
  isLeader,
}: {
  journey: Journey;
  userName: string | null | undefined;
  userCode: string | null | undefined;
  event: { destination: string | null; start_date: string | null; end_date: string | null } | null;
  dayKey: string;
  setDayKey: (k: string) => void;
  roster: TeamRoster | undefined;
  isLeader: boolean;
}) {
  const gaps = journeyGaps(journey);
  const next = journeyNext(journey, gaps);
  const stages = useMemo(() => buildJourneyStages(journey), [journey]);
  const days = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stages) {
      if (s.dayKey !== "undated" && !map.has(s.dayKey)) {
        map.set(s.dayKey, formatDate(s.dayKey));
      }
    }
    return [...map.entries()];
  }, [stages]);
  const visible = dayKey === "all" ? stages : stages.filter((s) => s.dayKey === dayKey);
  const upcomingIso = firstUpcomingAt(journey);
  const outbound = journey.flights.find((f) => f.direction === "outbound") ?? journey.flights[0];
  const galaTable = journey.gala?.my_seat
    ? `${galaTableLabel(journey.gala.my_seat.table_name, journey.gala.my_seat.table_code)} · Ghế ${journey.gala.my_seat.seat_number}`
    : journey.gala?.tables[0] != null
      ? "Chưa gán ghế"
      : isGalaSelectable(journey)
        ? "Chưa chọn ghế"
        : journey.gala
          ? "Chưa có bàn"
          : "—";
  const pinned = journey.announcements.filter((a) => a.is_pinned);
  const rest = journey.announcements.filter((a) => !a.is_pinned);
  const headline = pinned[0] ?? rest[0];
  const more = journey.announcements.filter((a) => a !== headline);

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-[#034e47] p-5 text-primary-foreground shadow-md sm:p-6">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold">
              <Plane className="size-3.5" aria-hidden="true" />
              {journey.destination ?? event?.destination ?? journey.event_name}
              {journey.start_date
                ? ` · ${formatDate(journey.start_date)}${journey.end_date ? ` – ${formatDate(journey.end_date)}` : ""}`
                : ""}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Chào mừng trở lại, {userName ?? "bạn"}!
            </h1>
            {next && (
              <p className="flex items-start gap-2 text-sm text-white/90">
                <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {next.warn ? next.label : next.detail}
                </span>
              </p>
            )}
          </div>
          <HeroCountdown targetIso={upcomingIso} />
        </div>
        <div className="relative z-10 mt-6 grid grid-cols-1 gap-3 border-t border-white/15 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat icon={Users} label="Đội thi đấu" value={journey.team_name ?? "—"} />
          <HeroStat
            icon={Plane}
            label="Chuyến bay"
            value={outbound ? `${outbound.flight_code}${outbound.airline ? ` · ${outbound.airline}` : ""}` : "Chưa có"}
          />
          <HeroStat
            icon={Hotel}
            label="Khách sạn & phòng"
            value={
              journey.room
                ? `${journey.room.hotel_name} · Phòng ${journey.room.room_number}`
                : "Chưa có phòng"
            }
          />
          <HeroStat icon={PartyPopper} label="Bàn tiệc Gala" value={galaTable} accent={galaTable.includes("Chưa")} />
        </div>
      </section>

      {next?.warn && (
        <section className="flex flex-col gap-4 rounded-2xl border-2 border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-[var(--ember)] text-white">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--ember)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                  Hành động gấp
                </span>
              </div>
              <h2 className="mt-1 font-display text-lg font-bold">{next.label}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{next.detail}</p>
            </div>
          </div>
          {next.href && (
            <Link
              href={next.href}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[var(--ember)] px-4 text-sm font-bold text-white"
            >
              {next.href.startsWith("/gala") ? "Xác nhận ghế Gala ngay" : "Hỏi trợ lý"}
            </Link>
          )}
        </section>
      )}

      {headline && (
        <details className="surface-card px-4 py-3">
          <summary className="cursor-pointer font-medium">
            {headline.title}
            {more.length > 0 ? ` · ${more.length} thông báo khác` : ""}
          </summary>
          <div className="mt-3 flex flex-col gap-3 text-sm text-muted-foreground">
            <LiteMarkdown text={headline.body_md} />
            {more.map((a) => (
              <article key={a.id}>
                <p className="font-medium text-foreground">{a.title}</p>
                <LiteMarkdown text={a.body_md} />
              </article>
            ))}
          </div>
        </details>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-8">
          <div className="surface-card flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex flex-wrap gap-2">
              <DayChip active={dayKey === "all"} onClick={() => setDayKey("all")}>
                Tất cả các chặng ({stages.length})
              </DayChip>
              {days.map(([key, label], i) => (
                <DayChip key={key} active={dayKey === key} onClick={() => setDayKey(key)}>
                  Ngày {i + 1}: {label}
                </DayChip>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có mốc nào trên hành trình.</p>
          ) : (
            <ol className="relative space-y-6 pl-7 sm:pl-8 before:absolute before:top-4 before:bottom-4 before:left-3 before:w-0.5 before:bg-border sm:before:left-3.5">
              {visible.map((stage) => (
                <StageCard key={stage.id} stage={stage} index={stages.indexOf(stage)} />
              ))}
            </ol>
          )}
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:col-span-4">
          <section className="surface-card space-y-3 p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <p className="flex items-center gap-2 text-sm font-bold">
                <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
                Thẻ thành viên điện tử
              </p>
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                ACTIVE
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              <InitialsAvatar name={userName} className="size-16 text-base" />
              <div className="min-w-0">
                <p className="font-bold">{userName}</p>
                {userCode && (
                  <p className="text-xs text-muted-foreground">
                    Mã NV: <strong className="text-foreground">{userCode}</strong>
                  </p>
                )}
                {journey.team_name && (
                  <p className="text-xs font-bold text-primary">{journey.team_name}</p>
                )}
              </div>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Mang mã nhân viên khi tập trung xe, điểm danh và cổng Gala.
            </p>
          </section>

          {roster && (
            <section className="surface-card space-y-3 p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <Users className="size-4 text-primary" aria-hidden="true" />
                  {roster.team_name}
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {roster.members.length} thành viên
                </span>
              </div>
              <ul className="space-y-1.5">
                {roster.members.slice(0, 8).map((m) => (
                  <li key={m.employee_id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <InitialsAvatar name={m.full_name} className="size-8 text-[10px]" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{m.full_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {m.employee_code ?? m.shift_name ?? "—"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-bold",
                        m.registration_status === "submitted" ? "text-emerald-600" : "text-orange-600",
                      )}
                    >
                      {m.registration_status === "submitted" ? "Đã sẵn sàng" : "Chưa gửi"}
                    </span>
                  </li>
                ))}
              </ul>
              {isLeader && (
                <Link
                  href="/team"
                  className="flex min-h-11 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
                >
                  Xem danh sách team
                </Link>
              )}
            </section>
          )}

          {journey.team_name && !roster && (
            <section className="surface-card p-5">
              <p className="flex items-center gap-2 text-sm font-bold">
                <Users className="size-4 text-primary" aria-hidden="true" />
                Team
              </p>
              <p className="mt-2 font-semibold">{journey.team_name}</p>
            </section>
          )}

          <section className="surface-card space-y-3 p-5">
            <p className="flex items-center gap-2 border-b border-border pb-3 text-sm font-bold">
              <Shield className="size-4 text-destructive" aria-hidden="true" />
              Hỗ trợ & khẩn cấp
            </p>
            <Link
              href="/chat"
              className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:border-primary"
            >
              <span>
                <span className="block font-semibold">Hỏi đáp BTC</span>
                <span className="text-xs text-muted-foreground">Trợ lý hành trình 24/7</span>
              </span>
              <MessageCircle className="size-4 text-primary" aria-hidden="true" />
            </Link>
            {journey.buses[0]?.leader_phone && (
              <a
                href={`tel:${journey.buses[0].leader_phone}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
              >
                <span>
                  <span className="block font-semibold">Trưởng xe</span>
                  <span className="text-xs text-muted-foreground">
                    {journey.buses[0].leader_name} · {journey.buses[0].leader_phone}
                  </span>
                </span>
                <Phone className="size-4 text-primary" aria-hidden="true" />
              </a>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Plane;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/15">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-white/70">{label}</p>
        <p className={cn("truncate text-sm font-bold", accent && "text-orange-200")}>{value}</p>
      </div>
    </div>
  );
}

function HeroCountdown({ targetIso }: { targetIso: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!targetIso) return null;
  const ms = parseEventDateTime(targetIso).getTime() - now;
  if (Number.isNaN(ms) || ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return (
    <div className="flex items-center gap-1 self-start rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-md">
      <CountPart n={days} label="Ngày" />
      <span className="text-xl text-white/40">:</span>
      <CountPart n={hours} label="Giờ" />
      <span className="text-xl text-white/40">:</span>
      <CountPart n={minutes} label="Phút" />
    </div>
  );
}

function CountPart({ n, label }: { n: number; label: string }) {
  return (
    <div className="min-w-12 px-2 text-center">
      <span className="block font-display text-2xl font-extrabold leading-none tabular">
        {String(n).padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-white/80">{label}</span>
    </div>
  );
}

function DayChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active ? "bg-primary text-primary-foreground shadow-sm" : "bg-slate-100 text-foreground hover:bg-slate-200",
      )}
    >
      {children}
    </button>
  );
}

function StageCard({ stage, index }: { stage: JourneyStage; index: number }) {
  const Icon = KIND_ICON[stage.kind];
  const action = stage.status === "action";
  return (
    <li id={stage.id} className="relative">
      <StageNode status={stage.status} />
      <article
        className={cn(
          "surface-card p-4 sm:p-5",
          action && "border-2 border-[var(--ember)] shadow-[var(--shadow-raised)]",
          stage.status === "pending" && "opacity-80",
        )}
      >
        <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-primary">
              CHẶNG {index + 1} • {stage.kicker.toUpperCase()}
            </span>
            {stage.dateLine && (
              <span className="text-xs text-muted-foreground">{stage.dateLine}</span>
            )}
          </div>
          <span
            className={cn(
              "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase",
              STATUS_TONE[stage.status],
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                action && "animate-pulse bg-[#B91C1C]",
                stage.status === "confirmed" && "bg-[#15803D]",
                stage.status === "waiting" && "bg-[#C2410C]",
                (stage.status === "upcoming" || stage.status === "pending") && "bg-slate-400",
              )}
            />
            {stage.statusLabel}
          </span>
        </div>
        <div className="flex flex-col gap-3 pt-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1.5">
            <h3 className="flex items-start gap-2 font-display text-lg font-bold">
              <Icon className={cn("mt-0.5 size-5 shrink-0", action ? "text-[var(--ember)]" : "text-primary")} aria-hidden="true" />
              {stage.title}
            </h3>
            {stage.subtitle && (
              <p className="flex items-center gap-1.5 text-sm">
                {stage.kind === "flight" ? (
                  <>
                    <span className="font-semibold">{stage.subtitle.split(" → ")[0]}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span className="font-semibold">{stage.subtitle.split(" → ")[1]}</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden="true" />
                    {stage.subtitle}
                  </span>
                )}
              </p>
            )}
            {stage.rows.length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {stage.rows.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            )}
            {stage.tel && (
              <a href={`tel:${stage.tel}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                <Phone className="size-3.5" aria-hidden="true" />
                {stage.telLabel ?? stage.tel}
              </a>
            )}
          </div>
          {stage.href && stage.cta && (
            <Link
              href={stage.href}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-bold",
                action
                  ? "bg-[var(--ember)] text-white"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {stage.cta}
            </Link>
          )}
        </div>
        {stage.note && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted-foreground">{stage.note}</p>
        )}
      </article>
    </li>
  );
}

function StageNode({ status }: { status: StageStatus }) {
  return (
    <span
      className={cn(
        "absolute -left-7 top-5 grid size-6 place-items-center rounded-full ring-4 ring-[var(--background)] sm:-left-8",
        status === "confirmed" && "bg-primary text-primary-foreground",
        status === "waiting" && "border-2 border-[var(--ember)] bg-card",
        status === "action" && "bg-destructive text-white",
        (status === "upcoming" || status === "pending") && "border-2 border-slate-300 bg-card",
      )}
      aria-hidden="true"
    >
      {status === "confirmed" && <Check className="size-3.5" />}
      {status === "action" && <span className="text-[11px] font-bold">!</span>}
      {status === "waiting" && <span className="size-2.5 animate-pulse rounded-full bg-[var(--ember)]" />}
      {(status === "upcoming" || status === "pending") && <Circle className="size-2 fill-slate-300 text-slate-300" />}
    </span>
  );
}
