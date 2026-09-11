"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, apiUpload, ApiError } from "@/lib/api";
import type { Employee, ImportBatch, ImportEnqueued, Job } from "@/types/api";

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);

  const { data: employees, isLoading } = useQuery({
    queryKey: ["employees", search],
    queryFn: () =>
      apiFetch<Employee[]>(`/api/employees${search ? `?search=${encodeURIComponent(search)}` : ""}`),
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
    onSuccess: (data) => {
      toast.info("Đang import, vui lòng chờ...");
      setActiveJobId(data.job_id);
      setActiveBatchId(data.batch_id);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Upload thất bại"),
  });

  useEffect(() => {
    if (job && (job.status === "succeeded" || job.status === "failed")) {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.id]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">CBNV</h1>
          <p className="text-sm text-zinc-500">Danh sách nhân viên trong hệ thống.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Tìm theo tên, email, mã NV..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
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
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
          >
            Import Excel
          </Button>
        </div>
      </div>

      {job && (job.status === "queued" || job.status === "running") && (
        <p className="text-sm text-zinc-500">
          Đang xử lý import (job #{job.id})... {job.progress}/{job.total ?? "?"}
        </p>
      )}

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

      {job && job.status === "failed" && (
        <p className="text-sm text-red-500">Import thất bại: {job.error}</p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã NV</TableHead>
            <TableHead>Họ tên</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Địa điểm</TableHead>
            <TableHead>SĐT</TableHead>
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-zinc-500">
                Đang tải...
              </TableCell>
            </TableRow>
          )}
          {employees?.map((emp) => (
            <TableRow key={emp.id}>
              <TableCell className="font-mono">{emp.employee_code ?? "—"}</TableCell>
              <TableCell>{emp.full_name}</TableCell>
              <TableCell>{emp.email}</TableCell>
              <TableCell>{emp.team_name ?? "—"}</TableCell>
              <TableCell>{emp.site_name ?? "—"}</TableCell>
              <TableCell>{emp.phone ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={emp.is_active ? "default" : "secondary"}>
                  {emp.is_active ? "Hoạt động" : "Ngừng"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
