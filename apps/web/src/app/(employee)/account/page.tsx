"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ProfileCard } from "@/components/domain/profile-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function AccountPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      }),
    onSuccess: async () => {
      toast.success("Đã đổi mật khẩu");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      await refreshUser();
      if (user?.role === "organizer" || user?.role === "super_admin") {
        router.push("/admin");
      }
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Không đổi được mật khẩu"),
  });

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirm &&
    !mutation.isPending;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="ticket-kicker">Hồ sơ của bạn</p>
        <h1 className="font-display text-3xl font-semibold">Tài khoản</h1>
      </div>

      {user?.must_change_password && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Bạn cần đổi mật khẩu trước khi dùng các chức năng khác.
        </div>
      )}

      <ProfileCard editablePhone />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đổi mật khẩu</CardTitle>
        </CardHeader>
        <CardContent className="flex max-w-sm flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
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
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Tối thiểu 8 ký tự</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Nhập lại mật khẩu mới</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm && confirm !== newPassword && (
              <p className="text-xs text-red-600">Mật khẩu nhập lại chưa khớp</p>
            )}
          </div>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
            Đổi mật khẩu
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
