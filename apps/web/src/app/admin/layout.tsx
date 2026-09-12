"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BrandMark } from "@/components/domain/brand-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Tổng quan" },
  { href: "/admin/events", label: "Sự kiện" },
  { href: "/admin/master-data", label: "Master Data" },
  { href: "/admin/employees", label: "CBNV" },
  { href: "/admin/users", label: "Tài khoản", superAdmin: true },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  pathname,
  showUsers,
  onNavigate,
}: {
  pathname: string;
  showUsers: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.filter((item) => !item.superAdmin || showUsers).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "px-3 py-2 text-sm",
            isActive(pathname, item.href)
              ? "bg-[var(--lagoon)] text-white"
              : "text-white/70 hover:bg-white/10 hover:text-white",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
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
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  const showUsers = user.role === "super_admin";

  return (
    <div className="flex min-h-svh flex-1 bg-[var(--foam)]">
      <aside className="hidden w-56 shrink-0 flex-col bg-[var(--night)] p-4 text-[#e8eef2] sm:flex">
        <div className="mb-8 px-1">
          <BrandMark light className="[&>span:last-child]:text-[15px]" />
          <p className="mt-2 pl-9 text-[11px] text-white/45">Bàn điều hành BTC</p>
        </div>
        <NavLinks pathname={pathname} showUsers={showUsers} />
        <div className="mt-auto flex flex-col gap-2 px-1 text-sm text-white/55">
          <p className="truncate text-white/80">{user.email}</p>
          <p className="text-xs">{ROLE_LABEL[user.role] ?? user.role}</p>
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
            onClick={() => logout().then(() => router.push("/login"))}
          >
            Đăng xuất
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 bg-[var(--night)] px-4 py-2 text-[#e8eef2] sm:hidden">
          <Sheet>
            <SheetTrigger
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-sm" }),
                "border-white/20 bg-transparent text-white",
              )}
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-none bg-[var(--night)] p-0 text-[#e8eef2]">
              <SheetHeader>
                <SheetTitle className="text-[#e8eef2]">
                  <BrandMark light />
                </SheetTitle>
              </SheetHeader>
              <div className="px-2 pb-4">
                <NavLinks pathname={pathname} showUsers={showUsers} />
              </div>
            </SheetContent>
          </Sheet>
          <p className="font-display text-base">Điều hành</p>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-7">{children}</main>
      </div>
    </div>
  );
}
