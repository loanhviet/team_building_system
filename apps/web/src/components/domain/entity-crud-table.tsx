"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api";

export type FieldDef = {
  name: string;
  label: string;
  required?: boolean;
};

type EntityRecord = Record<string, unknown> & { id: number; is_active: boolean };

export function EntityCrudTable({
  queryKey,
  label,
  basePath,
  fields,
}: {
  queryKey: string[];
  label: string;
  basePath: string;
  fields: FieldDef[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntityRecord | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiFetch<EntityRecord[]>(basePath),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const resetForm = () => setValues({});

  const openCreate = () => {
    setEditingEntity(null);
    resetForm();
    setOpen(true);
  };
  const openEdit = (entity: EntityRecord) => {
    setEditingEntity(entity);
    setValues(Object.fromEntries(fields.map((f) => [f.name, String(entity[f.name] ?? "")])));
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        if (values[f.name]) payload[f.name] = values[f.name];
      }
      return editingEntity
        ? apiFetch(`${basePath}/${editingEntity.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : apiFetch(basePath, { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      toast.success(editingEntity ? `Đã cập nhật ${label.toLowerCase()}` : `Đã thêm ${label.toLowerCase()}`);
      setOpen(false);
      setEditingEntity(null);
      resetForm();
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (entity: EntityRecord) =>
      entity.is_active
        ? apiFetch(`${basePath}/${entity.id}`, { method: "DELETE" })
        : apiFetch(`${basePath}/${entity.id}`, {
            method: "PATCH",
            body: JSON.stringify({ is_active: true }),
          }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Có lỗi xảy ra"),
  });

  const requiredFilled = fields.filter((f) => f.required !== false).every((f) => values[f.name]);

  const filtered = (data ?? []).filter((e) => {
    if (!search) return true;
    const needle = search.toLowerCase();
    return fields.some((f) => String(e[f.name] ?? "").toLowerCase().includes(needle));
  });

  const columns: DataTableColumn<EntityRecord>[] = [
    ...fields.map((f) => ({
      key: f.name,
      header: f.label,
      cell: (e: EntityRecord) => String(e[f.name] ?? ""),
      sortValue: (e: EntityRecord) => String(e[f.name] ?? ""),
      className: f.name === "code" ? "font-mono" : undefined,
    })),
    {
      key: "is_active",
      header: "Trạng thái",
      cell: (e) => (
        <Badge variant={e.is_active ? "default" : "secondary"}>
          {e.is_active ? "Hoạt động" : "Ngừng"}
        </Badge>
      ),
      sortValue: (e) => (e.is_active ? 1 : 0),
    },
    {
      key: "actions",
      header: "Thao tác",
      className: "text-right",
      cell: (e) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(e)}>
            Sửa
          </Button>
          {e.is_active ? (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" disabled={toggleActiveMutation.isPending}>
                  Vô hiệu hoá
                </Button>
              }
              title={`Vô hiệu hoá ${label.toLowerCase()} này?`}
              description="Sẽ ẩn khỏi các lựa chọn mới, dữ liệu đã gắn với nó vẫn giữ nguyên."
              confirmLabel="Vô hiệu hoá"
              destructive
              onConfirm={() => toggleActiveMutation.mutate(e)}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleActiveMutation.mutate(e)}
              disabled={toggleActiveMutation.isPending}
            >
              Kích hoạt lại
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        emptyMessage="Chưa có dữ liệu"
        toolbar={
          <>
            <Input
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger className={buttonVariants({ size: "sm", className: "ml-auto" })} onClick={openCreate}>
                Thêm {label.toLowerCase()}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingEntity ? `Sửa ${label.toLowerCase()}` : `Thêm ${label.toLowerCase()}`}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  {fields.map((f) => (
                    <div key={f.name} className="flex flex-col gap-2">
                      <Label htmlFor={f.name}>{f.label}</Label>
                      <Input
                        id={f.name}
                        value={values[f.name] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={!requiredFilled || saveMutation.isPending}
                  >
                    Lưu
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />
    </div>
  );
}
