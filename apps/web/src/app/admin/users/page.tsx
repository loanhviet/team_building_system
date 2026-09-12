"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      toast.success(`Mật khẩu tạm: ${result.temporary_password}`);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Không reset được"),
  });

  if (user && user.role !== "super_admin") return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="ticket-kicker">Super Admin</p>
        <h1 className="font-display text-3xl font-semibold">Tài khoản</h1>
      </div>
      <div className="flex flex-wrap gap-2">
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
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Họ tên</TableHead>
            <TableHead>Mã NV</TableHead>
            <TableHead>Vai trò</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Đang tải...
              </TableCell>
            </TableRow>
          )}
          {data?.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.email}</TableCell>
              <TableCell>{row.full_name ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{row.employee_code ?? "—"}</TableCell>
              <TableCell>
                <Select
                  value={row.role}
                  onValueChange={(v) => v && updateMutation.mutate({ id: row.id, body: { role: v as Role } })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Badge variant={row.is_active ? "default" : "secondary"}>
                  {row.is_active ? "Hoạt động" : "Khoá"}
                </Badge>
              </TableCell>
              <TableCell className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateMutation.mutate({ id: row.id, body: { is_active: !row.is_active } })}
                >
                  {row.is_active ? "Khoá" : "Mở khoá"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => resetMutation.mutate(row.id)}>
                  Reset MK
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
