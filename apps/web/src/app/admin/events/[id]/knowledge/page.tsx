"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { PageHeader } from "@/components/domain/page-header";
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

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.title.toLowerCase().includes(q) || r.body_md.toLowerCase().includes(q);
  });

  const columns: DataTableColumn<KnowledgeDocument>[] = [
    {
      key: "title",
      header: "Tiêu đề",
      cell: (row) => row.title,
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
      header: "Cập nhật",
      cell: (row) => new Date(row.updated_at).toLocaleString("vi-VN"),
      sortValue: (row) => row.updated_at,
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
            Sửa
          </Button>
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="outline">
                Xoá
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
      <PageHeader
        title="Tài liệu hỏi đáp"
        description="FAQ / handbook markdown. Chỉ bản đã đăng được trợ lý dùng. CBNV hỏi trên /chat, không thấy trang này."
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.id}
        isLoading={isLoading}
        onRowClick={openEdit}
        emptyMessage="Chưa có tài liệu. Tạo FAQ về dress code, chính sách hủy, mang theo gì…"
        toolbar={
          <>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tiêu đề / nội dung"
              className="w-64"
            />
            <Button onClick={openCreate}>Thêm tài liệu</Button>
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
            {job && (
              <span className="text-xs text-muted-foreground">
                Job: {jobStatusLabel(job.status)}
                {job.status === "succeeded" && job.result_json
                  ? ` — ${JSON.stringify(job.result_json)}`
                  : ""}
              </span>
            )}
          </>
        }
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
