"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Employee } from "@/types/api";

export function ProfileCard({ editablePhone = false }: { editablePhone?: boolean }) {
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
    { label: "Họ và tên", value: user.full_name ?? "—" },
    { label: "Email", value: user.email },
    { label: "Mã nhân viên", value: user.employee_code ?? "—" },
    { label: "Team", value: user.team_name ?? "—" },
    { label: "Địa điểm", value: user.site_name ?? "—" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Thông tin cá nhân</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-xs text-muted-foreground">{row.label}</p>
            <p className="text-sm font-medium">{row.value}</p>
          </div>
        ))}
        <div className="sm:col-span-2">
          <Label htmlFor="profile-phone" className="text-xs text-muted-foreground">
            Số điện thoại
          </Label>
          {editablePhone && editing ? (
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
