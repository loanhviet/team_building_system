"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/domain/empty-state";
import { LiteMarkdown } from "@/components/domain/lite-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { Journey } from "@/types/api";

export default function JourneyPage() {
  const { user } = useAuth();

  const {
    data: journey,
    isLoading,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["journey", "me"],
    queryFn: () => apiFetch<Journey>("/api/journey/me"),
    enabled: !!user,
    retry: false,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải hành trình...</p>;
  }

  if (error) {
    // resolve_published_event raises 404 no_published_event when the CBNV
    // genuinely has nothing published yet — everything else (network drop,
    // a 500) is a real failure and must not look like the same empty state.
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

  const galaOpen =
    journey.gala &&
    (journey.gala.status === "drawing" || journey.gala.status === "in_progress");

  const scheduleByDay = new Map<string, Journey["schedule"]>();
  for (const item of journey.schedule) {
    const key = item.day_date ?? "—";
    const list = scheduleByDay.get(key) ?? [];
    list.push(item);
    scheduleByDay.set(key, list);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="ticket-kicker">
            {journey.destination ?? "Team Building"}
            {journey.start_date ? `  ${formatDate(journey.start_date)}` : ""}
            {journey.end_date ? ` – ${formatDate(journey.end_date)}` : ""}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{journey.event_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {journey.full_name}
            {journey.employee_code ? `  ${journey.employee_code}` : ""}
            {journey.team_name ? `  ·  ${journey.team_name}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Làm mới">
          <RotateCw className={cn("size-4", isFetching && "animate-spin")} />
        </Button>
      </header>
      {dataUpdatedAt > 0 && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Cập nhật lúc {formatDateTime(new Date(dataUpdatedAt).toISOString())}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Ticket kicker="Hành khách" title="Cá nhân & Team">
          <p className="text-sm">
            {journey.full_name} — {journey.team_name ?? "Chưa có Team"}
          </p>
          {journey.site_name && (
            <p className="text-sm text-muted-foreground">Làm việc tại {journey.site_name}</p>
          )}
          {journey.phone && <p className="text-sm text-muted-foreground">SĐT: {journey.phone}</p>}
        </Ticket>

        <Ticket kicker="BTC" title="Thông báo">
          {journey.announcements.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có thông báo nào</p>
          )}
          {journey.announcements.map((a, i) => (
            <div key={i} className="border-b border-dashed border-[var(--rule)] pb-2 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{a.title}</p>
                {a.is_pinned && <Badge variant="secondary">Ghim</Badge>}
                {a.published_at && (
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.published_at)}</span>
                )}
              </div>
              <LiteMarkdown text={a.body_md} className="text-sm text-muted-foreground" />
            </div>
          ))}
        </Ticket>

        <Ticket kicker="Bay" title="Chuyến bay">
          {journey.flights.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có thông tin chuyến bay</p>
          )}
          {journey.flights.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 border-b border-dashed border-[var(--rule)] py-2 text-sm last:border-0 last:pb-0 first:pt-0">
              <div>
                <p className="font-medium">
                  {f.direction === "outbound" ? "Chiều đi" : "Chiều về"} {f.flight_code}
                  {f.airline ? `  ${f.airline}` : ""}
                </p>
                <p className="text-muted-foreground">
                  {f.origin ?? "—"} → {f.destination ?? "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg leading-none">
                  {f.depart_at ? formatTime(f.depart_at) : "—"}
                </p>
                {f.arrive_at && (
                  <p className="text-xs text-muted-foreground">đến {formatTime(f.arrive_at)}</p>
                )}
              </div>
              {f.depart_at && (
                <p className="col-span-2 text-xs text-muted-foreground">{formatDateTime(f.depart_at)}</p>
              )}
            </div>
          ))}
          {journey.flights.length === 1 && (
            <p className="text-xs text-muted-foreground">
              Chưa có thông tin chuyến{" "}
              {journey.flights[0].direction === "outbound" ? "về" : "đi"} — BTC sẽ cập nhật sau.
            </p>
          )}
        </Ticket>

        <Ticket kicker="Đưa đón" title="Xe">
          {journey.buses.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có thông tin xe</p>
          )}
          {journey.buses.map((b, i) => (
            <div key={i} className="flex flex-col gap-0.5 border-b border-dashed border-[var(--rule)] py-2 text-sm last:border-0 last:pb-0 first:pt-0">
              <p className="font-medium">
                {b.leg_name}: xe {b.bus_code}
                {b.bus_name ? ` (${b.bus_name})` : ""}
              </p>
              {b.pickup_name && (
                <p className="text-muted-foreground">
                  Tập trung: {b.pickup_name}
                  {b.pickup_address ? ` — ${b.pickup_address}` : ""}
                </p>
              )}
              {b.gather_at && (
                <p className="text-muted-foreground">Giờ tập trung: {formatDateTime(b.gather_at)}</p>
              )}
              {b.depart_at && (
                <p className="text-muted-foreground">Khởi hành: {formatDateTime(b.depart_at)}</p>
              )}
              {b.destination && <p className="text-muted-foreground">Điểm đến: {b.destination}</p>}
              {b.leader_name && (
                <p className="text-muted-foreground">
                  Trưởng xe: {b.leader_name}
                  {b.leader_phone ? (
                    <>
                      {" "}
                      (
                      <a href={`tel:${b.leader_phone}`} className="underline underline-offset-2">
                        {b.leader_phone}
                      </a>
                      )
                    </>
                  ) : null}
                </p>
              )}
              {b.note && <p className="text-muted-foreground">Lưu ý: {b.note}</p>}
            </div>
          ))}
        </Ticket>

        <Ticket kicker="Lưu trú" title="Khách sạn & phòng">
          {journey.room ? (
            <div className="text-sm">
              <p className="font-medium">{journey.room.hotel_name}</p>
              {journey.room.hotel_address && (
                <p className="text-muted-foreground">{journey.room.hotel_address}</p>
              )}
              <p className="font-display text-2xl">Phòng {journey.room.room_number}</p>
              {(journey.room.checkin_date || journey.room.checkout_date) && (
                <p className="text-muted-foreground">
                  {formatDate(journey.room.checkin_date)} → {formatDate(journey.room.checkout_date)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có thông tin phòng</p>
          )}
        </Ticket>

        <Ticket kicker="Tối Gala" title="Gala Dinner" lantern>
          {!journey.gala && (
            <p className="text-sm text-muted-foreground">Chưa cấu hình Gala Dinner</p>
          )}
          {journey.gala && journey.gala.tables.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Team chưa chọn bàn/ghế
              {galaOpen && (
                <>
                  {" — "}
                  <Link href={`/gala/${journey.event_id}`} className="text-primary underline">
                    Mở sơ đồ Gala
                  </Link>
                </>
              )}
            </p>
          )}
          {journey.gala?.tables.map((t) => (
            <p key={t.table_code} className="font-display text-xl">
              Bàn {t.table_name ?? t.table_code}
              <span className="ml-2 text-base font-sans">
                ghế {t.seats.map((s) => s.label ?? s.seat_number).join(", ")}
              </span>
            </p>
          ))}
          {journey.gala && (
            <Link href={`/gala/${journey.event_id}`} className="text-sm text-primary underline">
              Xem sơ đồ Gala
            </Link>
          )}
        </Ticket>

        <Ticket kicker="Chương trình" title="Lịch trình">
          {journey.schedule.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có lịch trình</p>
          )}
          {[...scheduleByDay.entries()].map(([day, items]) => (
            <div key={day} className="border-b border-dashed border-[var(--rule)] pb-2 last:border-0 last:pb-0">
              {day !== "—" && (
                <p className="ticket-kicker mb-1">{formatDate(day)}</p>
              )}
              {items.map((s, i) => (
                <div key={i} className="grid grid-cols-[5.5rem_1fr] gap-3 py-1 text-sm">
                  <p className="font-display text-base leading-tight">
                    {s.start_at ? formatTime(s.start_at) : "—"}
                    {s.end_at ? ` – ${formatTime(s.end_at)}` : ""}
                  </p>
                  <div>
                    <p className="font-medium">{s.title}</p>
                    {s.location && <p className="text-muted-foreground">{s.location}</p>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </Ticket>
      </div>
    </div>
  );
}

function Ticket({
  kicker,
  title,
  children,
  lantern = false,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  lantern?: boolean;
}) {
  return (
    <article className="ticket">
      <div className={cn("ticket-spine", lantern && "ticket-spine-lantern")} />
      <div className="ticket-body flex flex-col gap-2">
        <p className="ticket-kicker">{kicker}</p>
        <h2 className="font-display text-xl leading-tight">{title}</h2>
        {children}
      </div>
    </article>
  );
}
