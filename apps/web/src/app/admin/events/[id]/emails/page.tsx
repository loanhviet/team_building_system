"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/domain/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import type { EmailTemplate } from "@/types/api";

export default function EmailTemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["events", eventId, "email-templates"],
    queryFn: () => apiFetch<EmailTemplate[]>(`/api/events/${eventId}/email-templates`),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<EmailTemplate>(`/api/events/${eventId}/email-templates/${selected}`, {
        method: "PUT",
        body: JSON.stringify({ subject, body_html: body }),
      }),
    onSuccess: () => {
      toast.success("Đã lưu mẫu email");
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "email-templates"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  const open = (tpl: EmailTemplate) => {
    setSelected(tpl.code);
    setSubject(tpl.subject);
    setBody(tpl.body_html);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải mẫu email...</p>;
  if (!data?.length) {
    return <EmptyState title="Chưa có mẫu email" description="Hệ thống sẽ dùng mẫu mặc định." />;
  }

  const current = data.find((t) => t.code === selected);

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <div className="flex flex-col gap-1">
        {data.map((tpl) => (
          <button
            key={tpl.code}
            type="button"
            onClick={() => open(tpl)}
            className={`px-3 py-2 text-left text-sm ${
              selected === tpl.code ? "bg-[var(--night)] text-white" : "hover:bg-secondary"
            }`}
          >
            <span className="block font-medium">{tpl.code}</span>
            <span className={selected === tpl.code ? "text-white/70" : "text-muted-foreground"}>
              {tpl.description}
            </span>
          </button>
        ))}
      </div>
      {current ? (
        <div className="ticket">
          <div className="ticket-spine" />
          <div className="ticket-body flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl">{current.code}</h2>
              {current.is_custom && <Badge variant="outline">Đã chỉnh</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              Dùng biến Jinja: {"{{ full_name }}"}, {"{{ event_name }}"}, {"{{ app_url }}"}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Tiêu đề</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nội dung HTML</Label>
              <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
            </div>
            <Button
              className="self-start"
              disabled={!subject || !body || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Lưu mẫu
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Chọn một mẫu bên trái để sửa.</p>
      )}
    </div>
  );
}
