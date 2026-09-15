"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, SquarePen } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/domain/empty-state";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { LiteMarkdown } from "@/components/domain/lite-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiChatStream, apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { directionLabel } from "@/lib/labels";
import { EVENT_STATUS_LABELS } from "@/lib/event-status";
import { useEmployeeEvent } from "@/lib/use-employee-event";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatSession, Citation, EventStatus, Journey } from "@/types/api";

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" role="presentation">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </span>
  );
}

const TOOL_LABEL: Record<string, string> = {
  get_event_context: "Đang xem trạng thái sự kiện…",
  get_my_registration: "Đang tra cứu đăng ký…",
  get_my_journey: "Đang tra cứu hành trình…",
  get_gala_my_team: "Đang xem Gala của team…",
  search_event_knowledge: "Đang tìm trong tài liệu sự kiện…",
  get_my_team_roster: "Đang xem danh sách team…",
};

function suggestionsFor(status: EventStatus | null, isLeader: boolean): string[] {
  if (status === "registration_open") {
    return [
      "Hạn đăng ký đến khi nào?",
      "Ca 2 có chắc được bay tối không?",
      "Quy định hủy đăng ký như thế nào?",
      "Tôi cần đăng ký xe những chặng nào?",
    ];
  }
  if (status === "registration_closed" || status === "allocation_processing") {
    return [
      "Khi nào tôi xem được hành trình?",
      "Tôi đã đăng ký ca nào?",
      "Tôi có đăng ký xe ra sân bay không?",
    ];
  }
  const published = [
    "Xe của tôi tập trung lúc mấy giờ?",
    "Tôi ở khách sạn nào, phòng số mấy?",
    "Chuyến bay chiều về của tôi thế nào?",
    "Lịch trình ngày 2 ra sao?",
  ];
  if (isLeader) published.push("Team mình ai chưa đăng ký?");
  return published;
}

function contextChips(journey: Journey | undefined): string[] {
  if (!journey) return [];
  const chips: string[] = [];
  if (journey.team_name) chips.push(journey.team_name);
  for (const f of journey.flights) {
    chips.push(`${directionLabel(f.direction)} ${f.flight_code}`);
  }
  if (journey.room) chips.push(`Phòng ${journey.room.room_number}`);
  const nextBus = journey.buses[0];
  if (nextBus) chips.push(`Xe ${nextBus.bus_code}`);
  return chips.slice(0, 6);
}

export default function ChatPage() {
  const { user } = useAuth();
  const { eventId, eventStatus, isLeader } = useEmployeeEvent();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolHint, setToolHint] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const { data: journey } = useQuery({
    queryKey: ["journey", "me", eventId],
    queryFn: () => apiFetch<Journey>(`/api/journey/me?event_id=${eventId}`),
    enabled: !!user && eventId != null,
    retry: false,
    throwOnError: false,
  });

  const { data: session } = useQuery({
    queryKey: ["chat", "session", eventId],
    queryFn: async () => {
      const sessions = await apiFetch<ChatSession[]>(`/api/chat/sessions?event_id=${eventId}`);
      if (sessions.length > 0) return sessions[0];
      return apiFetch<ChatSession>("/api/chat/sessions", {
        method: "POST",
        body: JSON.stringify({ event_id: eventId }),
      });
    },
    enabled: eventId != null && !!user,
  });

  const { data: messages } = useQuery({
    queryKey: ["chat", "messages", session?.id],
    queryFn: () => apiFetch<ChatMessage[]>(`/api/chat/sessions/${session!.id}/messages`),
    enabled: !!session,
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      setIsStreaming(true);
      setStreamingText("");
      setToolHint(null);
      let errored = false;
      await apiChatStream(`/api/chat/sessions/${session!.id}/messages`, { content }, (evt) => {
        if (evt.tool) setToolHint(TOOL_LABEL[evt.tool] ?? "Đang tra cứu…");
        if (evt.delta) {
          setToolHint(null);
          setStreamingText((prev) => (prev ?? "") + evt.delta);
        }
        if (evt.error) {
          errored = true;
          toast.error(evt.error);
        }
      });
      if (errored) throw new Error("stream_error");
    },
    onSuccess: () => {
      setStreamingText(null);
      setIsStreaming(false);
      setToolHint(null);
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", session?.id] });
    },
    onError: (err) => {
      setIsStreaming(false);
      setStreamingText(null);
      setToolHint(null);
      if (!(err instanceof Error && err.message === "stream_error")) {
        toast.error(err instanceof ApiError ? err.message : "Gửi tin nhắn thất bại");
      }
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", session?.id] });
    },
  });

  const newChatMutation = useMutation({
    mutationFn: () =>
      apiFetch<ChatSession>("/api/chat/sessions", {
        method: "POST",
        body: JSON.stringify({ event_id: eventId }),
      }),
    onSuccess: (created) => {
      queryClient.setQueryData(["chat", "session", eventId], created);
      queryClient.setQueryData(["chat", "messages", created.id], []);
      setStreamingText(null);
      setToolHint(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không tạo được hội thoại mới"),
  });

  const handleSend = (text: string) => {
    if (!text.trim() || !session || isStreaming) return;
    setInput("");
    queryClient.setQueryData<ChatMessage[]>(["chat", "messages", session.id], (prev) => [
      ...(prev ?? []),
      { id: Date.now(), role: "user", content: text, citations_json: null, created_at: "" },
    ]);
    sendMutation.mutate(text);
  };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, toolHint]);

  if (eventId === null) {
    return (
      <EmptyState
        title="Chưa có sự kiện để hỏi đáp"
        description="Khi BTC mở đăng ký, trợ lý trả lời quy định và form của bạn. Sau khi công bố hành trình, hỏi được xe, phòng, chuyến bay."
      />
    );
  }

  const suggestions = suggestionsFor(eventStatus, isLeader);
  const fromJourney = contextChips(journey);
  const chips =
    fromJourney.length > 0 ? fromJourney : eventStatus ? [EVENT_STATUS_LABELS[eventStatus]] : [];
  const empty = (messages?.length ?? 0) === 0 && !streamingText;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">Hỏi đáp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tra cứu hành trình <span className="font-medium text-foreground">của bạn</span> và tài liệu
            BTC đã đăng. Không đoán thông tin chưa công bố.
          </p>
          {chips.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <li key={c}>
                  <Badge variant="secondary">{c}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          variant="outline"
          className="min-h-11 shrink-0"
          disabled={!session || isStreaming || newChatMutation.isPending}
          onClick={() => newChatMutation.mutate()}
          aria-label="Hội thoại mới"
        >
          <SquarePen className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Hội thoại mới</span>
        </Button>
      </div>

      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border border-border bg-card p-4"
        aria-live="polite"
      >
        {empty && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Có thể hỏi: đăng ký, chuyến bay, xe, phòng, ghế Gala, lịch, quy định. Không xem được dữ
              liệu người khác
              {isLeader ? " — trừ danh sách team khi bạn là trưởng nhóm." : "."}
            </p>
            <p className="text-sm font-medium">Gợi ý</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  className="min-h-11 animate-in cursor-pointer fade-in slide-in-from-bottom-1 rounded-xl border border-border bg-background px-3 py-2 text-left text-sm transition-colors duration-200 fill-mode-backwards hover:border-primary hover:bg-primary/5"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages?.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex animate-in gap-2 fade-in slide-in-from-bottom-1 items-start duration-200",
              m.role === "user" && "flex-row-reverse",
            )}
          >
            {m.role === "assistant" ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
            ) : (
              <InitialsAvatar name={user?.full_name} className="size-8 text-[11px]" />
            )}
            <div
              className={cn(
                "max-w-[85%] px-3 py-2 text-sm",
                m.role === "user"
                  ? "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground"
                  : "rounded-2xl rounded-tl-sm border border-border bg-card",
              )}
            >
              {m.role === "assistant" ? (
                <LiteMarkdown text={m.content} className="flex flex-col gap-1" />
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
              {m.citations_json && m.citations_json.length > 0 && (
                <CitationRow citations={m.citations_json} />
              )}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex animate-in items-start gap-2 fade-in duration-200">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2 text-sm">
              {toolHint && !streamingText && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <TypingDots />
                  {toolHint}
                </p>
              )}
              {streamingText ? <LiteMarkdown text={streamingText} /> : !toolHint ? <TypingDots /> : null}
            </div>
          </div>
        )}
      </div>

      <form
        className="flex gap-2 bg-background py-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Hỏi về chuyến đi của bạn…"
          maxLength={2000}
          disabled={!session || isStreaming}
          className="min-h-11"
          aria-label="Câu hỏi"
        />
        <Button
          type="submit"
          className="min-h-11 min-w-11"
          disabled={!session || isStreaming || !input.trim()}
          aria-label="Gửi"
        >
          <Send className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Gửi</span>
        </Button>
      </form>
    </div>
  );
}

function CitationRow({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {citations.map((c, i) =>
        c.href ? (
          <Link key={`${c.title}-${i}`} href={c.href}>
            <Badge variant="outline" className="text-xs hover:bg-background">
              {c.title}
            </Badge>
          </Link>
        ) : (
          <Badge key={`${c.title}-${i}`} variant="outline" className="text-xs">
            {c.title}
          </Badge>
        ),
      )}
    </div>
  );
}
