"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
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
import { ActivePill } from "@/components/domain/active-pill";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/domain/data-table";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { WorkspaceHeader } from "@/components/domain/workspace-header";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
    {
      key: "full_name",
      header: "Người dùng",
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <InitialsAvatar name={r.full_name ?? r.email} className="size-8" />
          <span className="min-w-0">
            <span className="block font-medium">{r.full_name ?? "—"}</span>
            <span className="block truncate text-xs text-muted-foreground">{r.email}</span>
          </span>
        </span>
      ),
      sortValue: (r) => r.full_name ?? r.email,
    },
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
      cell: (r) => <Badge variant="outline">{ROLE_LABEL[r.role]}</Badge>,
      sortValue: (r) => ROLE_LABEL[r.role],
    },
    {
      key: "is_active",
      header: "Trạng thái",
      cell: (r) => <ActivePill active={r.is_active} inactiveLabel="Khoá" />,
      sortValue: (r) => (r.is_active ? 1 : 0),
    },
    {
      key: "chevron",
      header: "",
      className: "w-8",
      cell: () => <ChevronRight className="size-4 text-muted-foreground/60" aria-hidden="true" />,
    },
  ];

  const rows = data ?? [];
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        title="Tài khoản đăng nhập"
        description="Đổi vai trò, khoá, hoặc cấp mật khẩu tạm. Chỉ Super Admin."
        stats={[
          { label: "Tổng tài khoản", value: rows.length },
          { label: "Đang khoá", value: rows.filter((r) => !r.is_active).length, warn: rows.some((r) => !r.is_active) },
        ]}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        pageSize={20}
        onRowClick={(r) => setSelectedId(r.id)}
        toolbar={
          <div className="flex w-full flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
            <Input
              placeholder="Tìm email, tên, mã NV…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-11 w-full sm:w-72"
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
              <Button variant="ghost" onClick={() => setRole("")}>
                Xoá lọc
              </Button>
            )}
          </div>
        }
      />

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader className="flex-row items-start gap-3 pr-8">
                <InitialsAvatar name={selected.full_name ?? selected.email} className="size-11 shrink-0" />
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base">{selected.full_name ?? "—"}</SheetTitle>
                  <SheetDescription className="truncate">{selected.email}</SheetDescription>
                </div>
              </SheetHeader>
              <div className="flex flex-col gap-4 overflow-y-auto px-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Mã NV</span>
                  <span className="font-mono">{selected.employee_code ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Trạng thái</span>
                  <ActivePill active={selected.is_active} inactiveLabel="Khoá" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-muted-foreground">Vai trò</span>
                  <Select
                    value={selected.role}
                    onValueChange={(v) =>
                      v && v !== selected.role && setPendingRoleChange({ row: selected, role: v as Role })
                    }
                  >
                    <SelectTrigger className="w-full">
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
                </div>
              </div>
              <SheetFooter className="flex-row flex-wrap gap-2">
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" className="flex-1">
                      {selected.is_active ? "Khoá tài khoản" : "Mở khoá"}
                    </Button>
                  }
                  title={selected.is_active ? "Khoá tài khoản này?" : "Mở khoá tài khoản này?"}
                  description={
                    selected.is_active
                      ? `${selected.email} sẽ không đăng nhập được cho đến khi mở khoá lại.`
                      : `${selected.email} sẽ đăng nhập lại được bình thường.`
                  }
                  confirmLabel={selected.is_active ? "Khoá" : "Mở khoá"}
                  destructive={selected.is_active}
                  onConfirm={() => updateMutation.mutate({ id: selected.id, body: { is_active: !selected.is_active } })}
                />
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" className="flex-1">
                      Reset mật khẩu
                    </Button>
                  }
                  title="Đặt lại mật khẩu?"
                  description={`Tạo mật khẩu tạm mới cho ${selected.email}, mật khẩu cũ sẽ không dùng được nữa.`}
                  confirmLabel="Đặt lại"
                  destructive
                  onConfirm={() => resetMutation.mutate(selected.id)}
                />
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

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
