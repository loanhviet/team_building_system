"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Callout } from "@/components/domain/callout";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABEL } from "@/lib/format";
import type { Employee } from "@/types/api";

export default function AccountPage() {
  const { user, refreshUser, logout } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [editingPhone, setEditingPhone] = useState(false);

  const passwordMutation = useMutation<unknown, Error, boolean>({
    mutationFn: () =>
      apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      }),
    onSuccess: async (_data, wasForced) => {
      toast.success("Đã đổi mật khẩu");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      await refreshUser();
      if (user?.role === "organizer" || user?.role === "super_admin") {
        router.push("/admin");
      } else if (wasForced) {
        router.push("/");
      }
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Không đổi được mật khẩu"),
  });

  const phoneMutation = useMutation({
    mutationFn: (next: string | null) =>
      apiFetch<Employee>("/api/employees/me", {
        method: "PATCH",
        body: JSON.stringify({ phone: next }),
      }),
    onSuccess: async () => {
      toast.success("Đã cập nhật số điện thoại");
      setEditingPhone(false);
      await refreshUser();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirm &&
    !passwordMutation.isPending;

  if (!user) return null;

  const facts = [
    { label: "Email", value: user.email },
    { label: "Mã nhân viên", value: user.employee_code ?? "—" },
    { label: "Team", value: user.team_name ?? "—" },
    { label: "Địa điểm", value: user.site_name ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="surface-card overflow-hidden">
        <div className="bg-primary px-5 py-6 text-primary-foreground">
          <div className="flex items-center gap-4">
            <InitialsAvatar
              name={user.full_name ?? user.email}
              className="size-16 bg-white/15 text-lg text-white"
            />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold">
                {user.full_name ?? user.email}
              </h1>
              <p className="mt-1 text-sm text-primary-foreground/80">
                {ROLE_LABEL[user.role] ?? user.role}
                {user.team_name ? ` · ${user.team_name}` : ""}
              </p>
            </div>
          </div>
        </div>
        <dl className="grid gap-4 p-5 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="mt-0.5 text-sm font-medium">{f.value}</dd>
            </div>
          ))}
          <div className="sm:col-span-2">
            <Label htmlFor="profile-phone" className="text-xs text-muted-foreground">
              Số điện thoại — BTC dùng để liên hệ khi điều phối xe
            </Label>
            {editingPhone ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  id="profile-phone"
                  className="min-h-11 max-w-xs"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <Button
                  className="min-h-11"
                  disabled={phoneMutation.isPending}
                  onClick={() => phoneMutation.mutate(phone.trim() || null)}
                >
                  Lưu SĐT
                </Button>
                <Button variant="outline" className="min-h-11" onClick={() => setEditingPhone(false)}>
                  Huỷ
                </Button>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-3">
                <p className="text-sm font-medium">{user.phone || "Chưa có"}</p>
                <Button variant="outline" onClick={() => { setPhone(user.phone ?? ""); setEditingPhone(true); }}>
                  {user.phone ? "Sửa" : "Thêm SĐT"}
                </Button>
              </div>
            )}
          </div>
        </dl>
      </section>

      {user.must_change_password && (
        <Callout tone="warn" title="Cần đổi mật khẩu">
          Đổi mật khẩu trước khi dùng các chức năng khác.
        </Callout>
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Bảo mật đăng nhập</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mật khẩu mới tối thiểu 8 ký tự. Không chia sẻ mật khẩu công ty.
        </p>
        <div className="mt-4 flex max-w-sm flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              className="min-h-11"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">Mật khẩu mới</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="min-h-11"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Nhập lại mật khẩu mới</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className="min-h-11"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm && confirm !== newPassword && (
              <p className="text-xs text-destructive">Mật khẩu nhập lại chưa khớp</p>
            )}
          </div>
          <Button
            className="min-h-11 self-start"
            disabled={!canSubmit}
            onClick={() => passwordMutation.mutate(user.must_change_password)}
          >
            Đổi mật khẩu
          </Button>
        </div>
      </section>

      <section className="surface-card flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Phiên đăng nhập</h2>
          <p className="text-sm text-muted-foreground">Thoát cổng trên thiết bị này.</p>
        </div>
        <Button
          variant="outline"
          className="min-h-11 text-destructive hover:bg-destructive/10"
          onClick={() => logout().then(() => router.push("/login"))}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Đăng xuất
        </Button>
      </section>
    </div>
  );
}
