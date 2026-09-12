"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { JobProgress } from "@/components/domain/job-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { apiDownload, apiFetch, apiUpload, ApiError } from "@/lib/api";
import type { Employee, EmployeeList, ImportBatch, ImportEnqueued, Job, Site, Team } from "@/types/api";

const EMPTY_FORM = {
  employee_code: "",
  full_name: "",
  email: "",
  team_id: "",
  site_id: "",
  phone: "",
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

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => apiFetch<Team[]>("/api/teams"),
  });
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: () => apiFetch<Site[]>("/api/sites"),
  });

  const listPath =
    `/api/employees?limit=${limit}&offset=${offset}` +
    (search ? `&search=${encodeURIComponent(search)}` : "") +
    (teamId ? `&team_id=${teamId}` : "") +
    (siteId ? `&site_id=${siteId}` : "");

  const { data, isLoading } = useQuery({
    queryKey: ["employees", { search, teamId, siteId, offset }],
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
    setDialogOpen(true);
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
    { key: "full_name", header: "Họ tên", cell: (emp) => emp.full_name, sortValue: (emp) => emp.full_name },
    { key: "email", header: "Email", cell: (emp) => emp.email, sortValue: (emp) => emp.email },
    {
      key: "team_name",
      header: "Team",
      cell: (emp) => emp.team_name ?? "—",
      sortValue: (emp) => emp.team_name ?? "",
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
      cell: (emp) => (
        <Badge variant={emp.is_active ? "default" : "secondary"}>
          {emp.is_active ? "Hoạt động" : "Ngừng"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (emp) => (
        <Button size="sm" variant="ghost" onClick={() => openEdit(emp)}>
          Sửa
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ticket-kicker">Hồ sơ công ty</p>
          <h1 className="font-display text-3xl font-semibold">CBNV</h1>
        </div>
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
          <Button onClick={openCreate}>Thêm CBNV</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Sửa CBNV" : "Thêm CBNV"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Mã NV</Label>
                  <Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Họ tên</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Team</Label>
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
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Địa điểm</Label>
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
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>SĐT</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button disabled={!form.full_name || !form.email || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                  Lưu
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Tìm theo tên, email, mã NV..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          className="w-64"
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
        {(teamId || siteId) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTeamId("");
              setSiteId("");
              setOffset(0);
            }}
          >
            Xoá lọc
          </Button>
        )}
      </div>

      <JobProgress jobId={activeJobId} />
      {job && job.status === "succeeded" && batch && (
        <div className="rounded-md border p-4 text-sm">
          <p className="font-medium">
            Import hoàn tất: {batch.ok_rows}/{batch.total_rows} dòng thành công.
          </p>
          {batch.errors_json && batch.errors_json.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-red-500">
              {batch.errors_json.map((e) => (
                <li key={e.row}>
                  Dòng {e.row}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(emp) => emp.id}
        isLoading={isLoading}
        emptyMessage="Chưa có CBNV nào khớp bộ lọc"
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          {total} CBNV · trang {Math.floor(offset / limit) + 1}
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
