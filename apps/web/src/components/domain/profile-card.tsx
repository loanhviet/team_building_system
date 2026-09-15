"use client";

import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InitialsAvatar } from "@/components/domain/initials-avatar";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Employee } from "@/types/api";

export function ProfileCard({
  editablePhone = false,
  controlledPhone,
  step,
}: {
  editablePhone?: boolean;
  /** When set, the phone field becomes a plain controlled input owned by the
   * caller instead of managing its own inline Save — used on the
   * registration form, where the phone has to be submitted together with
   * the rest of the form. The separate "Sửa/Lưu" flow below was a silent
   * data-loss trap there: type a number, hit "Gửi đăng ký" without hitting
   * "Lưu" first, and the phone was never saved. */
  controlledPhone?: { value: string; onChange: (value: string) => void };
  /** Numbered badge shown before the title, for use inside a multi-step flow. */
  step?: number;
}) {
  const { user, refreshUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [editing, setEditing] = useState(false);

  const mutation = useMutation({
    mutationFn: (next: string | null) =>
      apiFetch<Employee>("/api/employees/me", {
        method: "PATCH",
        body: JSON.stringify({ phone: next }),
      }),
    onSuccess: async () => {
      toast.success("Đã cập nhật số điện thoại");
      setEditing(false);
      await refreshUser();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không lưu được"),
  });

  if (!user) return null;

  const rows: { label: string; value: string }[] = [
    { label: "Email", value: user.email },
    { label: "Mã nhân viên", value: user.employee_code ?? "—" },
    { label: "Team", value: user.team_name ?? "—" },
    { label: "Địa điểm", value: user.site_name ?? "—" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {step != null && (
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
              {step}
            </span>
          )}
          <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Thông tin cá nhân
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <InitialsAvatar name={user.full_name} className="size-11 text-sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{user.full_name ?? "—"}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <BadgeCheck className="size-3.5 text-primary" aria-hidden />
              Đã xác thực từ hồ sơ nhân sự
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-xs text-muted-foreground">{row.label}</p>
            <p className="text-sm font-medium">{row.value}</p>
          </div>
        ))}
        </div>
        <div>
          <Label htmlFor="profile-phone" className="text-xs text-muted-foreground">
            Số điện thoại
          </Label>
          {controlledPhone ? (
            <Input
              id="profile-phone"
              className="mt-1"
              value={controlledPhone.value}
              onChange={(e) => controlledPhone.onChange(e.target.value)}
              placeholder="Nhập SĐT liên hệ"
            />
          ) : editablePhone && editing ? (
            <div className="mt-1 flex gap-2">
              <Input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Nhập SĐT liên hệ"
              />
              <Button
                size="sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(phone.trim() || null)}
              >
                Lưu
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                Huỷ
              </Button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <p className="text-sm font-medium">{user.phone || "—"}</p>
              {editablePhone && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPhone(user.phone ?? "");
                    setEditing(true);
                  }}
                >
                  Sửa
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
