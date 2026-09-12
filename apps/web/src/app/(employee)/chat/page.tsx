"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiChatStream, apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useEmployeeEvent } from "@/lib/use-employee-event";
import type { ChatMessage, ChatSession } from "@/types/api";

const SUGGESTIONS = [
  "Xe của tôi tập trung lúc mấy giờ?",
  "Tôi ở khách sạn nào, phòng số mấy?",
  "Chuyến bay của tôi mấy giờ khởi hành?",
  "Lịch trình chương trình như thế nào?",
];

export default function ChatPage() {
  const { user } = useAuth();
  const { eventId } = useEmployeeEvent();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

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

  if (eventId === null) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-display text-2xl">Chưa có sự kiện để hỏi đáp</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Đăng ký và chờ BTC công bố thông tin, sau đó trợ lý mới có dữ liệu của bạn.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col gap-4">
      <div>
        <p className="ticket-kicker">Trợ lý hành trình</p>
        <h1 className="font-display text-3xl font-semibold">Hỏi đáp</h1>
      </div>

      <div className="flex min-h-[40vh] flex-1 flex-col gap-3 overflow-auto rounded-lg border bg-card p-4">
        {messages?.length === 0 && !streamingText && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Gợi ý câu hỏi:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-full border px-3 py-1 text-xs hover:bg-secondary"
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
              m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary"
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
          <div className="max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-sm">
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
