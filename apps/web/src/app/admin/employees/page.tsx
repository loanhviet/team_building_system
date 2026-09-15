"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MapPin, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ActivePill } from "@/components/domain/active-pill";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { FormField } from "@/components/domain/form-field";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { JobProgress } from "@/components/domain/job-progress";
import { WorkspaceHeader } from "@/components/domain/workspace-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiDownload, apiFetch, apiUpload, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  Employee,
  EmployeeList,
  EmployeeStats,
  ImportBatch,
  ImportEnqueued,
  Job,
  Site,
  Team,
} from "@/types/api";

const EMPTY_FORM = {
  employee_code: "",
  full_name: "",
  email: "",
  team_id: "",
  site_id: "",
  phone: "",
  position: "",
  is_active: true,
};

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [teamId, setTeamId] = useState<string>("");
  const [siteId, setSiteId] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isActive, setIsActive] = useState("");
  const [sendWelcome, setSendWelcome] = useState(true);
  const [showImportLog, setShowImportLog] = useState(false);

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => apiFetch<Team[]>("/api/teams"),
  });
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: () => apiFetch<Site[]>("/api/sites"),
  });
  const { data: stats } = useQuery({
    queryKey: ["employees", "stats"],
    queryFn: () => apiFetch<EmployeeStats>("/api/employees/stats"),
  });

  const listPath =
    `/api/employees?limit=${limit}&offset=${offset}` +
    (search ? `&search=${encodeURIComponent(search)}` : "") +
    (teamId ? `&team_id=${teamId}` : "") +
    (siteId ? `&site_id=${siteId}` : "") +
    (isActive ? `&is_active=${isActive}` : "");

  const { data, isLoading } = useQuery({
    queryKey: ["employees", { search, teamId, siteId, isActive, offset }],
    queryFn: () => apiFetch<EmployeeList>(listPath),
  });

  const { data: job } = useQuery({
    queryKey: ["jobs", activeJobId],
    queryFn: () => apiFetch<Job>(`/api/jobs/${activeJobId}`),
    enabled: activeJobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "succeeded" || status === "failed" ? false : 1200;
    },
  });

  const { data: batch } = useQuery({
    queryKey: ["import-batches", activeBatchId],
    queryFn: () => apiFetch<ImportBatch>(`/api/employees/import/${activeBatchId}`),
    enabled: activeBatchId !== null && (job?.status === "succeeded" || job?.status === "failed"),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => apiUpload<ImportEnqueued>("/api/employees/import", file),
    onSuccess: (result) => {
      toast.info("Đang import, vui lòng chờ...");
      setActiveJobId(result.job_id);
      setActiveBatchId(result.batch_id);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Upload thất bại"),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        employee_code: form.employee_code || null,
        full_name: form.full_name,
        email: form.email,
        team_id: form.team_id ? Number(form.team_id) : null,
        site_id: form.site_id ? Number(form.site_id) : null,
        phone: form.phone || null,
        position: form.position || null,
        ...(editing ? { is_active: form.is_active } : { send_welcome: sendWelcome }),
      };
      if (editing) {
        return apiFetch<Employee>(`/api/employees/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<Employee>("/api/employees", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Đã cập nhật CBNV" : "Đã thêm CBNV");
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  useEffect(() => {
    if (job && (job.status === "succeeded" || job.status === "failed")) {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.id]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSendWelcome(true);
    setDialogOpen(true);
  };

  const generateCode = async () => {
    try {
      const res = await apiFetch<{ employee_code: string }>("/api/employees/next-code");
      setForm((f) => ({ ...f, employee_code: res.employee_code }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không sinh được mã");
    }
  };
  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setForm({
      employee_code: emp.employee_code ?? "",
      full_name: emp.full_name,
      email: emp.email,
      team_id: emp.team_id ? String(emp.team_id) : "",
      site_id: emp.site_id ? String(emp.site_id) : "",
      phone: emp.phone ?? "",
      position: emp.position ?? "",
      is_active: emp.is_active,
    });
    setDialogOpen(true);
  };

  const total = data?.total ?? 0;
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const columns: DataTableColumn<Employee>[] = [
    {
      key: "employee_code",
      header: "Mã NV",
      cell: (emp) => <span className="font-mono">{emp.employee_code ?? "—"}</span>,
      sortValue: (emp) => emp.employee_code ?? "",
    },
    {
      key: "full_name",
      header: "Họ tên",
      cell: (emp) => (
        <span className="flex items-center gap-2.5">
          <InitialsAvatar name={emp.full_name} className="size-8" />
          <span className="min-w-0">
            <span className="block font-medium">{emp.full_name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {emp.position || emp.email}
            </span>
          </span>
        </span>
      ),
      sortValue: (emp) => emp.full_name,
    },
    {
      key: "team_name",
      header: "Team",
      cell: (emp) =>
        emp.team_name ? (
          <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {emp.team_name}
          </span>
        ) : (
          "—"
        ),
      sortValue: (emp) => emp.team_name ?? "",
    },
    {
      key: "email",
      header: "Email",
      cell: (emp) => <span className="text-xs">{emp.email}</span>,
      sortValue: (emp) => emp.email,
    },
    {
      key: "site_name",
      header: "Địa điểm",
      cell: (emp) => emp.site_name ?? "—",
      sortValue: (emp) => emp.site_name ?? "",
    },
    { key: "phone", header: "SĐT", cell: (emp) => emp.phone ?? "—" },
    {
      key: "is_active",
      header: "Trạng thái",
      cell: (emp) => <ActivePill active={emp.is_active} />,
      sortValue: (emp) => (emp.is_active ? 1 : 0),
    },
    {
      key: "chevron",
      header: "",
      className: "w-8",
      cell: () => <ChevronRight className="size-4 text-muted-foreground/60" aria-hidden="true" />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        title="Danh bạ nhân sự toàn công ty"
        description="Hồ sơ công ty — bấm một dòng để sửa. Import Excel khi danh sách lớn."
        actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => apiDownload("/api/employees/import-template", "employees_template.xlsx")}>
            File mẫu
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              apiDownload(
                `/api/employees/export${search || teamId || siteId ? "?" : ""}${[
                  search ? `search=${encodeURIComponent(search)}` : "",
                  teamId ? `team_id=${teamId}` : "",
                  siteId ? `site_id=${siteId}` : "",
                  isActive ? `is_active=${isActive}` : "",
                ]
                  .filter(Boolean)
                  .join("&")}`,
                "employees.xlsx",
              )
            }
          >
            Export Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importMutation.mutate(file);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}>
            Import Excel
          </Button>
          <Button className="min-h-10" onClick={openCreate}>Thêm nhân viên</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Sửa hồ sơ nhân viên" : "Thêm nhân viên mới vào Danh bạ công ty"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Mã nhân viên">
                  <div className="flex gap-2">
                    <Input
                      value={form.employee_code}
                      onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
                      placeholder="NV-000"
                    />
                    {!editing && (
                      <Button type="button" variant="outline" onClick={() => void generateCode()}>
                        <Sparkles className="size-4" aria-hidden="true" />
                        Tự động sinh
                      </Button>
                    )}
                  </div>
                </FormField>
                <FormField label="Họ và tên" required>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Ví dụ: Lê Hoàng Quân"
                  />
                </FormField>
                <FormField label="Email công ty" required>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </FormField>
                <FormField label="Số điện thoại">
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </FormField>
                <FormField label="Chức vụ">
                  <Input
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                    placeholder="Vd: QA Lead"
                  />
                </FormField>
                <FormField label="Khối / Team">
                  <Select value={form.team_id} onValueChange={(v) => setForm({ ...form, team_id: v ?? "" })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams?.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Địa điểm làm việc" className="sm:col-span-2">
                  <Select value={form.site_id} onValueChange={(v) => setForm({ ...form, site_id: v ?? "" })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn địa điểm" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                {editing && (
                  <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                    <Checkbox
                      checked={form.is_active}
                      onCheckedChange={(checked) => setForm({ ...form, is_active: checked === true })}
                    />
                    Đang hoạt động
                  </label>
                )}
                {!editing && (
                  <label className="flex items-start gap-2 text-sm sm:col-span-2">
                    <Checkbox
                      checked={sendWelcome}
                      onCheckedChange={(checked) => setSendWelcome(checked === true)}
                      className="mt-0.5"
                    />
                    Gửi email kích hoạt tài khoản kèm hướng dẫn đăng nhập lần đầu (mật khẩu tạm = mã NV).
                  </label>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Huỷ bỏ
                </Button>
                <Button disabled={!form.full_name || !form.email || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                  Lưu thông tin nhân viên
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        }
      />

      {stats && (
        <section className="board grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" aria-label="Thống kê nhân sự">
          <div className="board-cell">
            <p className="text-xs font-medium text-muted-foreground">Tổng nhân sự</p>
            <p className="board-n mt-1">{stats.total}</p>
            <p className="mt-1 text-xs text-muted-foreground">người trong danh bạ</p>
          </div>
          <div className="board-cell">
            <p className="text-xs font-medium text-muted-foreground">Đang hoạt động</p>
            <p className="board-n mt-1 text-[var(--lagoon-deep)]">{stats.active}</p>
            <p className="mt-1 text-xs text-emerald-700">
              {stats.total ? Math.round((stats.active / stats.total) * 1000) / 10 : 0}% hồ sơ còn đầy đủ
            </p>
          </div>
          <div className="board-cell">
            <p className="text-xs font-medium text-muted-foreground">Tài khoản đăng nhập</p>
            <p className="board-n mt-1">{stats.accounts ?? stats.total}</p>
            <p className="mt-1 text-xs text-muted-foreground">User gắn với hồ sơ CBNV</p>
          </div>
          <div className="board-cell">
            <p className="text-xs font-medium text-muted-foreground">Phân bổ theo địa điểm</p>
            <ul className="mt-2 space-y-1 text-xs">
              {(stats.by_site ?? []).slice(0, 4).map((s) => (
                <li key={s.site_id} className="flex justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <MapPin className="size-3" aria-hidden="true" />
                    {s.site_name}
                  </span>
                  <span className="font-semibold tabular">{s.count}</span>
                </li>
              ))}
              {(stats.by_site ?? []).length === 0 && <li className="text-muted-foreground">Chưa gắn địa điểm</li>}
            </ul>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
        <Input
          placeholder="Tìm tên, email, mã NV…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          className="min-h-11 w-full sm:w-72"
        />
        <Select
          value={teamId}
          onValueChange={(v) => {
            setTeamId(v ?? "");
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Lọc team" />
          </SelectTrigger>
          <SelectContent>
            {teams?.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={siteId}
          onValueChange={(v) => {
            setSiteId(v ?? "");
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Lọc địa điểm" />
          </SelectTrigger>
          <SelectContent>
            {sites?.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={isActive || "__all__"}
          onValueChange={(v) => {
            setIsActive(v === "__all__" ? "" : (v ?? ""));
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tất cả trạng thái</SelectItem>
            <SelectItem value="true">Đang hoạt động</SelectItem>
            <SelectItem value="false">Không hoạt động</SelectItem>
          </SelectContent>
        </Select>
        {(teamId || siteId || isActive) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTeamId("");
              setSiteId("");
              setIsActive("");
              setOffset(0);
            }}
          >
            Xoá lọc
          </Button>
        )}
      </div>

      {activeJobId && (job?.status === "queued" || job?.status === "running") && (
        <div className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              Đang nhập dữ liệu{batch?.filename ? ` từ tệp: ${batch.filename}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Job #{job?.id} · {job?.status === "running" ? "Đang xử lý nền" : "Trong hàng đợi"}
            </p>
          </div>
          <JobProgress jobId={activeJobId} />
        </div>
      )}
      {job && job.status === "succeeded" && batch && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium">
            Import hoàn tất: {batch.ok_rows}/{batch.total_rows} dòng thành công
            {batch.error_rows ? ` · ${batch.error_rows} lỗi` : ""}.
          </p>
          {batch.errors_json && batch.errors_json.length > 0 && (
            <>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowImportLog((v) => !v)}>
                {showImportLog ? "Ẩn log" : "Xem log"}
              </Button>
              {showImportLog && (
                <ul className="mt-2 list-inside list-disc text-red-600">
                  {batch.errors_json.map((e) => (
                    <li key={e.row}>
                      Dòng {e.row}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
      {job?.status === "failed" && <JobProgress jobId={activeJobId} />}

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(emp) => emp.id}
        isLoading={isLoading}
        emptyMessage="Chưa có CBNV nào khớp bộ lọc"
        onRowClick={openEdit}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          Hiển thị {total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} trên {total} nhân viên
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - limit))}>
            Trước
          </Button>
          <Button size="sm" variant="outline" disabled={!canNext} onClick={() => setOffset(offset + limit)}>
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
