"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const [values, setValues] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiFetch<EntityRecord[]>(basePath),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const resetForm = () => setValues({});

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        if (values[f.name]) payload[f.name] = values[f.name];
      }
      return apiFetch(basePath, { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      toast.success(`Đã thêm ${label.toLowerCase()}`);
      setOpen(false);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className={buttonVariants({ size: "sm" })}>
            Thêm {label.toLowerCase()}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Thêm {label.toLowerCase()}</DialogTitle>
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
                onClick={() => createMutation.mutate()}
                disabled={!requiredFilled || createMutation.isPending}
              >
                Lưu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {fields.map((f) => (
              <TableHead key={f.name}>{f.label}</TableHead>
            ))}
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={fields.length + 2} className="text-center text-zinc-500">
                Đang tải...
              </TableCell>
            </TableRow>
          )}
          {!isLoading && data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={fields.length + 2} className="text-center text-zinc-500">
                Chưa có dữ liệu
              </TableCell>
            </TableRow>
          )}
          {data?.map((entity) => (
            <TableRow key={entity.id}>
              {fields.map((f) => (
                <TableCell key={f.name} className={f.name === "code" ? "font-mono" : undefined}>
                  {String(entity[f.name] ?? "")}
                </TableCell>
              ))}
              <TableCell>
                <Badge variant={entity.is_active ? "default" : "secondary"}>
                  {entity.is_active ? "Hoạt động" : "Ngừng"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleActiveMutation.mutate(entity)}
                  disabled={toggleActiveMutation.isPending}
                >
                  {entity.is_active ? "Vô hiệu hoá" : "Kích hoạt lại"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
