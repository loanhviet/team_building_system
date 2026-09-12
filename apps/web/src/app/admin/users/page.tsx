"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABEL } from "@/lib/format";
import type { Role, UserAdmin } from "@/types/api";

const ROLES: Role[] = ["employee", "team_leader", "organizer", "super_admin"];

export default function UsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("");
  const [pendingRoleChange, setPendingRoleChange] = useState<{ row: UserAdmin; role: Role } | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "super_admin") router.replace("/admin");
  }, [user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["users", { search, role }],
    queryFn: () =>
      apiFetch<UserAdmin[]>(
        `/api/users?${[
          search ? `search=${encodeURIComponent(search)}` : "",
          role ? `role=${role}` : "",
        ]
          .filter(Boolean)
          .join("&")}`,
      ),
    enabled: user?.role === "super_admin",
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { role?: Role; is_active?: boolean } }) =>
      apiFetch<UserAdmin>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("Đã cập nhật tài khoản");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  const resetMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ temporary_password: string }>(`/api/users/${id}/reset-password`, { method: "POST" }),
    onSuccess: (result) => {
      setTempPassword(result.temporary_password);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không reset được"),
  });

  if (user && user.role !== "super_admin") return null;

  const columns: DataTableColumn<UserAdmin>[] = [
    { key: "email", header: "Email", cell: (r) => r.email, sortValue: (r) => r.email },
    { key: "full_name", header: "Họ tên", cell: (r) => r.full_name ?? "—", sortValue: (r) => r.full_name },
    {
      key: "employee_code",
      header: "Mã NV",
      cell: (r) => r.employee_code ?? "—",
      className: "font-mono text-xs",
      sortValue: (r) => r.employee_code,
    },
    {
      key: "role",
      header: "Vai trò",
      cell: (r) => (
        <Select
          value={r.role}
          onValueChange={(v) => v && v !== r.role && setPendingRoleChange({ row: r, role: v as Role })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((rl) => (
              <SelectItem key={rl} value={rl}>
                {ROLE_LABEL[rl]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
      sortValue: (r) => ROLE_LABEL[r.role],
    },
    {
      key: "is_active",
      header: "Trạng thái",
      cell: (r) => (
        <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Hoạt động" : "Khoá"}</Badge>
      ),
      sortValue: (r) => (r.is_active ? 1 : 0),
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="outline">
                {r.is_active ? "Khoá" : "Mở khoá"}
              </Button>
            }
            title={r.is_active ? "Khoá tài khoản này?" : "Mở khoá tài khoản này?"}
            description={
              r.is_active
                ? `${r.email} sẽ không đăng nhập được cho đến khi mở khoá lại.`
                : `${r.email} sẽ đăng nhập lại được bình thường.`
            }
            confirmLabel={r.is_active ? "Khoá" : "Mở khoá"}
            destructive={r.is_active}
            onConfirm={() => updateMutation.mutate({ id: r.id, body: { is_active: !r.is_active } })}
          />
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="outline">
                Reset MK
              </Button>
            }
            title="Đặt lại mật khẩu?"
            description={`Tạo mật khẩu tạm mới cho ${r.email}, mật khẩu cũ sẽ không dùng được nữa.`}
            confirmLabel="Đặt lại"
            destructive
            onConfirm={() => resetMutation.mutate(r.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="ticket-kicker">Super Admin</p>
        <h1 className="font-display text-3xl font-semibold">Tài khoản</h1>
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        pageSize={20}
        toolbar={
          <>
            <Input
              placeholder="Tìm email, tên, mã NV..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Select value={role} onValueChange={(v) => setRole(v ?? "")}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Lọc vai trò" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role && (
              <Button variant="ghost" size="sm" onClick={() => setRole("")}>
                Xoá lọc
              </Button>
            )}
          </>
        }
      />

      <AlertDialog open={!!pendingRoleChange} onOpenChange={(open) => !open && setPendingRoleChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đổi vai trò tài khoản?</AlertDialogTitle>
            {pendingRoleChange && (
              <AlertDialogDescription>
                Đổi vai trò của {pendingRoleChange.row.email} từ &quot;{ROLE_LABEL[pendingRoleChange.row.role]}
                &quot; sang &quot;{ROLE_LABEL[pendingRoleChange.role]}&quot;. Quyền truy cập sẽ thay đổi ngay.
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingRoleChange) return;
                updateMutation.mutate({ id: pendingRoleChange.row.id, body: { role: pendingRoleChange.role } });
                setPendingRoleChange(null);
              }}
            >
              Đổi vai trò
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!tempPassword} onOpenChange={(open) => !open && setTempPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mật khẩu tạm</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Gửi mật khẩu này cho nhân viên qua kênh riêng. Họ nên đổi mật khẩu ngay khi đăng nhập.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                {tempPassword}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (tempPassword) navigator.clipboard.writeText(tempPassword);
                  toast.success("Đã sao chép");
                }}
              >
                Sao chép
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
