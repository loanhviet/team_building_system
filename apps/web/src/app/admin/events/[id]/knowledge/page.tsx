"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { use, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { WorkspaceHeader } from "@/components/domain/workspace-header";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { jobStatusLabel } from "@/lib/labels";
import type { Event, Job, KnowledgeCopyResult, KnowledgeDocument } from "@/types/api";

const emptyForm = { title: "", body_md: "", is_published: false };

export default function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const eventId = Number(id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "published" | "draft">("");
  const [editing, setEditing] = useState<KnowledgeDocument | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [jobId, setJobId] = useState<number | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string>("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["events", eventId, "knowledge"],
    queryFn: () => apiFetch<KnowledgeDocument[]>(`/api/events/${eventId}/knowledge`),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch<Event[]>("/api/events"),
    enabled: copyOpen,
  });
  const copySources = events.filter((e) => e.id !== eventId);

  const { data: job } = useQuery({
    queryKey: ["jobs", jobId],
    queryFn: () => apiFetch<Job>(`/api/jobs/${jobId}`),
    enabled: jobId != null,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status === "succeeded" || status === "failed") return false;
      return 1500;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["events", eventId, "knowledge"] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return apiFetch<KnowledgeDocument>(
          `/api/events/${eventId}/knowledge/${editing.id}`,
          { method: "PATCH", body: JSON.stringify(form) },
        );
      }
      return apiFetch<KnowledgeDocument>(`/api/events/${eventId}/knowledge`, {
        method: "POST",
        body: JSON.stringify(form),
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Đã lưu tài liệu" : "Đã tạo tài liệu");
      setEditing(null);
      setCreating(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: number) =>
      apiFetch(`/api/events/${eventId}/knowledge/${docId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Đã xoá tài liệu");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không xoá được"),
  });

  const reindexMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ job_id: number }>(`/api/events/${eventId}/rag/reindex`, { method: "POST" }),
    onSuccess: (res) => {
      setJobId(res.job_id);
      toast.success("Đã gửi job đánh chỉ mục");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không reindex được"),
  });

  const copyMutation = useMutation({
    mutationFn: () =>
      apiFetch<KnowledgeCopyResult>(
        `/api/events/${eventId}/knowledge/copy-from/${copySourceId}`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      toast.success(`Đã sao chép ${res.copied} tài liệu, bỏ qua ${res.skipped} trùng tiêu đề`);
      setCopyOpen(false);
      setCopySourceId("");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không sao chép được"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setCreating(true);
  };

  const openEdit = (doc: KnowledgeDocument) => {
    setCreating(false);
    setEditing(doc);
    setForm({ title: doc.title, body_md: doc.body_md, is_published: doc.is_published });
  };

  const publishedCount = rows.filter((r) => r.is_published).length;
  const draftCount = rows.length - publishedCount;

  const filtered = rows.filter((r) => {
    if (statusFilter === "published" && !r.is_published) return false;
    if (statusFilter === "draft" && r.is_published) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.title.toLowerCase().includes(q) || r.body_md.toLowerCase().includes(q);
  });

  const excerpt = (body: string) => {
    const line = body.replace(/[#*_>`-]/g, "").trim().split("\n").find(Boolean) ?? "";
    return line.length > 80 ? `${line.slice(0, 80)}…` : line;
  };

  const columns: DataTableColumn<KnowledgeDocument>[] = [
    {
      key: "title",
      header: "Tiêu đề tài liệu",
      cell: (row) => (
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium">{row.title}</span>
            {row.body_md.trim() && (
              <span className="block truncate text-xs text-muted-foreground">{excerpt(row.body_md)}</span>
            )}
          </span>
        </div>
      ),
      sortValue: (row) => row.title,
    },
    {
      key: "published",
      header: "Trạng thái",
      cell: (row) => (
        <Badge variant={row.is_published ? "default" : "outline"}>
          {row.is_published ? "Đã đăng" : "Nháp"}
        </Badge>
      ),
      sortValue: (row) => (row.is_published ? 1 : 0),
    },
    {
      key: "updated",
      header: "Cập nhật lần cuối",
      cell: (row) => new Date(row.updated_at).toLocaleString("vi-VN"),
      sortValue: (row) => row.updated_at,
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => openEdit(row)} aria-label={`Sửa ${row.title}`}>
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="ghost" aria-label={`Xoá ${row.title}`}>
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            }
            title="Xoá tài liệu hỏi đáp?"
            description="Câu trả lời chat sẽ không còn dùng tài liệu này sau khi đánh chỉ mục lại."
            confirmLabel="Xoá"
            destructive
            onConfirm={() => deleteMutation.mutate(row.id)}
          />
        </div>
      ),
    },
  ];

  const dialogOpen = creating || editing != null;

  return (
    <div className="flex flex-col gap-4">
      <WorkspaceHeader
        title="Tài liệu hỏi đáp"
        description="FAQ / handbook markdown. Chỉ bản đã đăng được trợ lý dùng. CBNV hỏi trên /chat, không thấy trang này."
        stats={[
          { label: "Tổng tài liệu", value: rows.length },
          { label: "Đã đăng", value: publishedCount },
          { label: "Nháp", value: draftCount, warn: draftCount > 0 },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => setCopyOpen(true)}>
              Sao chép từ sự kiện khác
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="outline" disabled={reindexMutation.isPending}>
                  Đánh chỉ mục lại
                </Button>
              }
              title="Đánh chỉ mục hỏi đáp?"
              description="Worker sẽ chunk + embed quy định, thông báo, lịch và FAQ đã đăng. Không đụng hành trình cá nhân (tool SQL)."
              confirmLabel="Chạy"
              onConfirm={() => reindexMutation.mutate()}
            />
            <Button onClick={openCreate}>Thêm tài liệu</Button>
          </>
        }
      />

      {job && (
        <p className="text-xs text-muted-foreground">
          Job đánh chỉ mục: {jobStatusLabel(job.status)}
          {job.status === "succeeded" && job.result_json ? ` — ${JSON.stringify(job.result_json)}` : ""}
        </p>
      )}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm tiêu đề / nội dung"
          className="min-h-11 w-full sm:w-72"
        />
        <Select value={statusFilter || "__all__"} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : (v as "published" | "draft"))}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tất cả trạng thái</SelectItem>
            <SelectItem value="published">Đã đăng</SelectItem>
            <SelectItem value="draft">Nháp</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter("")}>
            Xoá lọc
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.id}
        isLoading={isLoading}
        onRowClick={openEdit}
        emptyMessage="Chưa có tài liệu. Tạo FAQ về dress code, chính sách hủy, mang theo gì…"
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa tài liệu" : "Thêm tài liệu"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="faq-title">Tiêu đề</Label>
              <Input
                id="faq-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="faq-body">Nội dung (markdown)</Label>
              <Textarea
                id="faq-body"
                rows={10}
                value={form.body_md}
                onChange={(e) => setForm((f) => ({ ...f, body_md: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
              />
              Đăng (trợ lý được dùng)
            </label>
            {form.is_published ? (
              <ConfirmDialog
                trigger={
                  <Button disabled={!form.title.trim() || !form.body_md.trim() || saveMutation.isPending}>
                    Lưu và đăng
                  </Button>
                }
                title="Đăng tài liệu này?"
                description="CBNV sẽ nhận câu trả lời từ nội dung này qua chat toàn công ty."
                confirmLabel="Đăng"
                onConfirm={() => saveMutation.mutate()}
              />
            ) : (
              <Button
                disabled={!form.title.trim() || !form.body_md.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                Lưu nháp
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sao chép tài liệu hỏi đáp</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Sao chép FAQ từ một sự kiện khác thành bản nháp ở đây. Tiêu đề đã có sẵn sẽ được
              bỏ qua. Bạn cần tự đăng lại từng tài liệu muốn dùng.
            </p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="copy-source">Sự kiện nguồn</Label>
              <Select value={copySourceId} onValueChange={(v) => setCopySourceId(v ?? "")}>
                <SelectTrigger id="copy-source">
                  <SelectValue placeholder="Chọn sự kiện" />
                </SelectTrigger>
                <SelectContent>
                  {copySources.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!copySourceId || copyMutation.isPending}
              onClick={() => copyMutation.mutate()}
            >
              Sao chép thành bản nháp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
