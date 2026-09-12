"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiChatStream, apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ChatMessage, ChatSession, Event, Journey } from "@/types/api";

const SUGGESTIONS = [
  "Xe của tôi tập trung lúc mấy giờ?",
  "Tôi ở khách sạn nào, phòng số mấy?",
  "Chuyến bay của tôi mấy giờ khởi hành?",
  "Lịch trình chương trình như thế nào?",
];

async function resolveEventId(): Promise<number | null> {
  try {
    const journey = await apiFetch<Journey>("/api/journey/me");
    return journey.event_id;
  } catch {
    const event = await apiFetch<Event | null>("/api/events/current");
    return event?.id ?? null;
  }
}

export default function ChatPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const { data: eventId } = useQuery({
    queryKey: ["chat", "event-id"],
    queryFn: resolveEventId,
    enabled: !!user,
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
    enabled: eventId != null,
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
      let errored = false;
      await apiChatStream(`/api/chat/sessions/${session!.id}/messages`, { content }, (evt) => {
        if (evt.delta) setStreamingText((prev) => (prev ?? "") + evt.delta);
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
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", session?.id] });
    },
    onError: (err) => {
      setIsStreaming(false);
      setStreamingText(null);
      if (!(err instanceof Error && err.message === "stream_error")) {
        toast.error(err instanceof ApiError ? err.message : "Gửi tin nhắn thất bại");
      }
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", session?.id] });
    },
  });

  const handleSend = (text: string) => {
    if (!text.trim() || !session) return;
    setInput("");
    queryClient.setQueryData<ChatMessage[]>(["chat", "messages", session.id], (prev) => [
      ...(prev ?? []),
      { id: Date.now(), role: "user", content: text, citations_json: null, created_at: "" },
    ]);
    sendMutation.mutate(text);
  };

  if (authLoading || !user) return <p className="p-6 text-sm text-zinc-500">Đang tải...</p>;
  if (eventId === null) {
    return <p className="p-6 text-sm text-zinc-500">Chưa có sự kiện nào để hỏi đáp.</p>;
  }

  return (
    <div className="mx-auto flex h-svh w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">Hỏi đáp Team Building</h1>

      <div className="flex flex-1 flex-col gap-3 overflow-auto rounded-md border p-4">
        {messages?.length === 0 && !streamingText && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-500">Gợi ý câu hỏi:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-full border px-3 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-blue-600 text-white"
                : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.citations_json && m.citations_json.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.citations_json.map((c, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">
                    {c.title}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
        {isStreaming && (
          <div className="max-w-[85%] rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
            <p className="whitespace-pre-wrap">{streamingText || "..."}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
          placeholder="Nhập câu hỏi..."
          disabled={!session || isStreaming}
        />
        <Button disabled={!session || isStreaming || !input.trim()} onClick={() => handleSend(input)}>
          Gửi
        </Button>
      </div>
    </div>
  );
}
