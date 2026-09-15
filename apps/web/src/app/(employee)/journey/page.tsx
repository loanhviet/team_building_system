"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bus, Hotel, PartyPopper, Plane, RotateCw, ScrollText } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/domain/empty-state";
import { LiteMarkdown } from "@/components/domain/lite-markdown";
import { PageHeader } from "@/components/domain/page-header";
import { PageSkeleton } from "@/components/domain/page-skeleton";
import { StatusChip } from "@/components/domain/status-chip";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { useEmployeeEvent } from "@/lib/use-employee-event";
import {
  buildTimeline,
  firstAnchorId,
  jumpTargets,
  journeyGaps,
  journeyNext,
  KIND_LABEL,
  type TimelineKind,
} from "@/lib/journey-view";
import { cn } from "@/lib/utils";
import type { Journey } from "@/types/api";

const KIND_ICON: Record<TimelineKind, typeof Plane> = {
  flight: Plane,
  bus: Bus,
  hotel: Hotel,
  gala: PartyPopper,
  program: ScrollText,
};

export default function JourneyPage() {
  const { user } = useAuth();
  const { eventId, eventName, canRegister, hasJourney } = useEmployeeEvent();
  const [openId, setOpenId] = useState<string | null>(null);

  const {
    data: journey,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["journey", "me", eventId],
    queryFn: () => apiFetch<Journey>(`/api/journey/me?event_id=${eventId}`),
    enabled: !!user && !!eventId && hasJourney,
    retry: false,
  });

  if (!eventId) {
    return (
      <EmptyState
        title="Chưa có kỳ nào"
        description="Khi BTC mở đăng ký, kỳ sẽ xuất hiện ở menu bên trái."
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

  const gaps = journeyGaps(journey);
  const next = journeyNext(journey, gaps);
  const days = buildTimeline(journey);
  const jumps = jumpTargets(days);

  const pinned = journey.announcements.filter((a) => a.is_pinned);
  const rest = journey.announcements.filter((a) => !a.is_pinned);
  const headline = pinned[0] ?? rest[0];
  const more = journey.announcements.filter((a) => a !== headline);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={journey.event_name}
        description={
          <>
            <p>
              {[user?.full_name, user?.employee_code, journey.team_name]
                .filter(Boolean)
                .join(" · ")}
              {journey.destination ? ` · ${journey.destination}` : ""}
            </p>
            <p>
              {formatDate(journey.start_date)}
              {journey.end_date ? ` – ${formatDate(journey.end_date)}` : ""}
            </p>
          </>
        }
        actions={
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Làm mới hành trình"
          >
            <RotateCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
        }
      />

      {next && (
        <section className={cn("next-panel", next.warn && "next-panel-warn")} aria-labelledby="next-title">
          <p className="text-xs font-medium text-muted-foreground">Việc tiếp theo</p>
          <p id="next-title" className="mt-1 font-display text-xl font-semibold">
            {next.label}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{next.detail}</p>
          {next.href && (
            <Link
              href={next.href}
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              {next.href.startsWith("/gala") ? "Mở sơ đồ Gala" : "Hỏi trợ lý"}
            </Link>
          )}
        </section>
      )}

      {gaps.length > 1 && (
        <ul className="flex flex-col gap-2">
          {gaps.slice(1).map((g) => (
            <li key={g.id}>
              <Link href={g.href} className="inline-flex">
                <StatusChip kind="flag" label={g.label} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {headline && (
        <details className="rounded-2xl border border-border bg-card px-4 py-3">
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

      {jumps.length > 1 && (
        <nav aria-label="Nhảy tới mốc" className="jump-nav">
          {jumps.map((j) => {
            const anchor = firstAnchorId(j.kind, days);
            if (!anchor) return null;
            const Icon = KIND_ICON[j.kind];
            return (
              <a key={j.kind} href={`#${anchor}`} className="gap-1.5">
                <Icon className="size-3.5" aria-hidden="true" />
                {j.label}
              </a>
            );
          })}
        </nav>
      )}

      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có mốc nào trên hành trình.</p>
      ) : (
        <ol className="timeline">
          {days.map((day) => (
            <li key={day.key} className="timeline-day">
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">{day.label}</h2>
              <ul>
                {day.items.map((item, i) => {
                  const Icon = KIND_ICON[item.kind];
                  const extras = item.lines.slice(1);
                  return (
                    <li key={item.id} id={item.id} className="timeline-item scroll-mt-24">
                      <span className="timeline-dot" aria-hidden="true" />
                      <article
                        className="flex cursor-pointer animate-in gap-3 fade-in slide-in-from-bottom-1 rounded-2xl border border-border bg-card p-3 duration-300 fill-mode-backwards sm:gap-4 sm:p-4"
                        style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
                        onClick={() => setOpenId((id) => (id === item.id ? null : item.id))}
                      >
                        <div className="flex shrink-0 flex-col items-center gap-1">
                          <p className="tabular text-sm font-semibold leading-none">{item.timeLabel}</p>
                          <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Icon className="size-3.5" aria-hidden="true" />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-muted-foreground">{KIND_LABEL[item.kind]}</p>
                          <h3 className="font-medium">{item.title}</h3>
                          {item.lines[0] && (
                            <p className="mt-0.5 text-sm text-muted-foreground">{item.lines[0]}</p>
                          )}
                          {(extras.length > 0 || item.tel || item.href) && openId === item.id && (
                              <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                                {extras.map((line) => (
                                  <p key={line}>{line}</p>
                                ))}
                                {item.tel && (
                                  <a
                                    href={`tel:${item.tel}`}
                                    className="text-primary underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {item.telLabel ?? item.tel}
                                  </a>
                                )}
                                {item.href && (
                                  <Link
                                    href={item.href}
                                    className="text-primary underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Xem sơ đồ
                                  </Link>
                                )}
                              </div>
                          )}
                          {(extras.length > 0 || item.tel || item.href) && openId !== item.id && (
                            <p className="mt-1 text-xs text-primary">Bấm để xem chi tiết</p>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
