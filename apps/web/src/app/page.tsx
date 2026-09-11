"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "organizer" || user.role === "super_admin") {
      router.replace("/admin");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500">Đang tải...</p>
      </div>
    );
  }

  if (user && user.role !== "organizer" && user.role !== "super_admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 dark:bg-black">
        <h1 className="text-xl font-semibold">Chào {user.full_name ?? user.email}</h1>
        <p className="text-sm text-zinc-500">
          Trang đăng ký Team Building và hành trình cá nhân sẽ có ở các phase tiếp theo.
        </p>
      </div>
    );
  }

  return null;
}
