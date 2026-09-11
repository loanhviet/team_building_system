"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Tổng quan" },
  { href: "/admin/events", label: "Sự kiện" },
  { href: "/admin/master-data", label: "Master Data" },
  { href: "/admin/employees", label: "CBNV" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "organizer" && user.role !== "super_admin") {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || (user.role !== "organizer" && user.role !== "super_admin")) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500">Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-1">
      <aside className="hidden w-56 shrink-0 border-r bg-zinc-50 p-4 dark:bg-zinc-950 sm:flex sm:flex-col">
        <p className="mb-6 px-2 text-lg font-semibold">Team Building</p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-2 py-1.5 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-800",
                pathname === item.href && "bg-zinc-200 font-medium dark:bg-zinc-800",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-2 text-sm text-zinc-500">
          <p className="truncate">{user.email}</p>
          <p className="text-xs uppercase">{user.role}</p>
          <Button variant="outline" size="sm" onClick={() => logout().then(() => router.push("/login"))}>
            Đăng xuất
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
