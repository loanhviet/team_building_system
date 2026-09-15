"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Mail, RotateCcw, Save, Send } from "lucide-react";
import { use, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmailOutboxPanel } from "@/components/domain/email-outbox-panel";
import { EmptyState } from "@/components/domain/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { EmailTemplate } from "@/types/api";

type Preview = { subject: string; body_html: string };

type Category = "all" | "confirm" | "remind" | "travel" | "ops";

const CATEGORY_OF: Record<string, Category> = {
  registration_confirmed: "confirm",
  registration_reminder: "remind",
  flight_changed: "travel",
  bus_changed: "travel",
  info_published: "ops",
  schedule_changed: "ops",
};

const TITLE_OF: Record<string, string> = {
  registration_confirmed: "Xác nhận đăng ký thành công",
  registration_reminder: "Nhắc nhở chưa gửi đăng ký",
  info_published: "Công bố hành trình",
  flight_changed: "Thay đổi chuyến bay",
  bus_changed: "Thay đổi xe đưa đón",
  schedule_changed: "Cập nhật lịch trình",
};

const VARS = [
  ["full_name", "Họ và tên"],
  ["event_name", "Tên sự kiện"],
  ["team_name", "Team (chỉ mẫu Xác nhận đăng ký)"],
  ["shift_name", "Ca (chỉ mẫu Xác nhận đăng ký)"],
  ["participating_label", "Tham gia (chỉ mẫu Xác nhận đăng ký)"],
  ["transport_summary", "Nhu cầu xe (chỉ mẫu Xác nhận đăng ký)"],
  ["app_url", "Cổng thông tin"],
  ["journey.room.hotel_name", "Tên khách sạn"],
  ["journey.room.room_number", "Số phòng"],
];

export default function EmailTemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [mode, setMode] = useState<"visual" | "html">("html");

  const { data, isLoading } = useQuery({
    queryKey: ["events", eventId, "email-templates"],
    queryFn: () => apiFetch<EmailTemplate[]>(`/api/events/${eventId}/email-templates`),
  });

  function open(tpl: EmailTemplate) {
    setSelected(tpl.code);
    setSubject(tpl.subject);
    setBody(tpl.body_html);
  }

  useEffect(() => {
    // Seed the editor from asynchronous server data exactly once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selected && data && data.length > 0) open(data[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only seed first selection
  }, [data]);

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

  const restoreMutation = useMutation({
    mutationFn: () =>
      apiFetch<EmailTemplate>(`/api/events/${eventId}/email-templates/${selected}`, {
        method: "DELETE",
      }),
    onSuccess: (tpl) => {
      toast.success("Đã khôi phục mẫu mặc định");
      setSubject(tpl.subject);
      setBody(tpl.body_html);
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "email-templates"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không khôi phục được"),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      apiFetch<Preview>(`/api/events/${eventId}/email-templates/${selected}/preview`, {
        method: "POST",
        body: JSON.stringify({ subject, body_html: body }),
      }),
    onSuccess: setPreview,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không xem trước được"),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ to: string }>(`/api/events/${eventId}/email-templates/${selected}/test`, {
        method: "POST",
        body: JSON.stringify({ subject, body_html: body }),
      }),
    onSuccess: (res) => toast.success(`Đã xếp hàng email thử tới ${res.to}`),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không gửi được thư thử"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((tpl) => {
      const cat = CATEGORY_OF[tpl.code] ?? "ops";
      if (category !== "all" && cat !== category) return false;
      if (!q) return true;
      const hay = `${tpl.code} ${TITLE_OF[tpl.code] ?? ""} ${tpl.description ?? ""} ${tpl.subject}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, category]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải mẫu email...</p>;
  if (!data?.length) {
    return <EmptyState title="Chưa có mẫu email" description="Hệ thống sẽ dùng mẫu mặc định." />;
  }

  const current = data.find((t) => t.code === selected);
  const counts = {
    all: data.length,
    confirm: data.filter((t) => CATEGORY_OF[t.code] === "confirm").length,
    remind: data.filter((t) => CATEGORY_OF[t.code] === "remind").length,
    travel: data.filter((t) => CATEGORY_OF[t.code] === "travel").length,
    ops: data.filter((t) => CATEGORY_OF[t.code] === "ops").length,
  };

  const insertVar = (name: string) => {
    setBody((prev) => `${prev}{{ ${name} }}`);
  };

  const copyVar = async (name: string) => {
    try {
      await navigator.clipboard.writeText(`{{ ${name} }}`);
      toast.success(`Đã copy {{ ${name} }}`);
    } catch {
      insertVar(name);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Quản lý mẫu email hệ thống</h1>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {data.length} mẫu kích hoạt
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Thiết lập nội dung thông báo tự động. Hỗ trợ cú pháp biến động Jinja. Không gửi hàng loạt từ màn này —
            mỗi mẫu gắn một sự kiện hệ thống (đăng ký, công bố, đổi bay/xe).
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Input
            placeholder="Tìm kiếm mẫu, mã code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72"
          />
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", `Tất cả (${counts.all})`],
                ["confirm", `Xác nhận (${counts.confirm})`],
                ["remind", `Nhắc nhở (${counts.remind})`],
                ["travel", `Bay / xe (${counts.travel})`],
                ["ops", `Vận hành (${counts.ops})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  category === id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Danh sách mẫu điện tử
          </p>
          {filtered.map((tpl) => (
            <button
              key={tpl.code}
              type="button"
              onClick={() => open(tpl)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                selected === tpl.code
                  ? "border-primary bg-primary/5 shadow-[var(--shadow-card)]"
                  : "border-border bg-card hover:bg-muted/50",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold tracking-wide text-primary">
                  {tpl.code.toUpperCase()}
                </span>
                <Badge variant={tpl.is_custom ? "default" : "outline"}>
                  {tpl.is_custom ? "Đã tùy chỉnh" : "Mặc định hệ thống"}
                </Badge>
              </div>
              <p className="font-semibold">{TITLE_OF[tpl.code] ?? tpl.code}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{tpl.description}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">Không có mẫu khớp bộ lọc.</p>
          )}
        </div>

        {current ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Mail className="size-4 text-primary" aria-hidden="true" />
                  <h2 className="font-display text-xl font-semibold">
                    {TITLE_OF[current.code] ?? current.code}
                  </h2>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {current.code}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
              </div>
              <div className="flex rounded-lg border border-border p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  className={cn("rounded-md px-2.5 py-1", mode === "visual" && "bg-muted")}
                  onClick={() => setMode("visual")}
                >
                  Xem trước
                </button>
                <button
                  type="button"
                  className={cn("rounded-md px-2.5 py-1", mode === "html" && "bg-muted")}
                  onClick={() => setMode("html")}
                >
                  HTML
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Tiêu đề email</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">{subject.length} ký tự</p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Biến động có sẵn</p>
                <p className="text-[11px] text-muted-foreground">Bấm để chèn vào nội dung</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VARS.map(([name, label]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => insertVar(name)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      void copyVar(name);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] hover:border-primary"
                    title={label}
                  >
                    {`{{ ${name} }}`}
                    <Copy className="size-3 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Chuyến bay/xe/Gala là danh sách — dùng vòng lặp Jinja, ví dụ:{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                  {"{% for f in journey.flights %}{{ f.flight_code }}{% endfor %}"}
                </code>
              </p>
            </div>

            {mode === "html" ? (
              <div className="flex flex-col gap-1.5">
                <Label>Nội dung HTML</Label>
                <div className="overflow-hidden rounded-xl bg-[#0f172a] ring-1 ring-slate-800">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px] text-slate-400">
                    <span>template-content.html</span>
                    <span>{body.split("\n").length} dòng</span>
                  </div>
                  <Textarea
                    rows={14}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-64 rounded-none border-0 bg-transparent font-mono text-xs text-slate-100 focus-visible:ring-0"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border p-4">
                <p className="mb-2 text-xs text-muted-foreground">Bản xem mẫu (dữ liệu giả)</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-3"
                  disabled={previewMutation.isPending}
                  onClick={() => previewMutation.mutate()}
                >
                  Render xem trước
                </Button>
                {preview ? (
                  <div>
                    <p className="mb-2 font-medium">{preview.subject}</p>
                    <div
                      className="max-h-80 overflow-y-auto text-sm"
                      dangerouslySetInnerHTML={{ __html: preview.body_html }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Bấm render để xem với dữ liệu mẫu.</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {current.is_custom && (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline">
                      <RotateCcw className="size-4" aria-hidden="true" />
                      Khôi phục mặc định
                    </Button>
                  }
                  title="Khôi phục mẫu mặc định?"
                  description="Nội dung đã chỉnh cho sự kiện này sẽ bị xoá, dùng lại mẫu gốc của hệ thống."
                  confirmLabel="Khôi phục"
                  destructive
                  onConfirm={() => restoreMutation.mutate()}
                />
              )}
              <Button
                variant="outline"
                disabled={!subject || !body || previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
              >
                <Eye className="size-4" aria-hidden="true" />
                Xem trước
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={!subject || !body || testMutation.isPending}>
                    <Send className="size-4" aria-hidden="true" />
                    Gửi mail thử
                  </Button>
                }
                title="Gửi email thử tới tài khoản của bạn?"
                description="Một thư [TEST] sẽ vào hộp thư BTC đang đăng nhập (MailHog khi dev). Không gửi cho toàn bộ CBNV."
                confirmLabel="Gửi thử"
                onConfirm={async () => {
                  await testMutation.mutateAsync();
                }}
              />
              <Button
                className="ml-auto"
                disabled={!subject || !body || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                <Save className="size-4" aria-hidden="true" />
                Lưu mẫu thay đổi
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Chọn một mẫu bên trái để sửa.</p>
        )}
      </div>

      <EmailOutboxPanel eventId={eventId} templateTitleOf={(code) => TITLE_OF[code] ?? code} />

      <Dialog open={!!preview && mode === "html"} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Xem trước email</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Tiêu đề</p>
                <p className="font-medium">{preview.subject}</p>
              </div>
              <div
                className="max-h-96 overflow-y-auto rounded-md border p-3 text-sm"
                dangerouslySetInnerHTML={{ __html: preview.body_html }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
