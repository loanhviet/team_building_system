import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/admin/events",
    title: "Sự kiện",
    description: "Tạo kỳ Team Building, cấu hình ca/chặng xe/điểm đón, chuyển trạng thái.",
  },
  {
    href: "/admin/master-data",
    title: "Master Data",
    description: "Quản lý danh sách Team và Địa điểm làm việc dùng chung cho mọi sự kiện.",
  },
  {
    href: "/admin/employees",
    title: "CBNV",
    description: "Quản lý danh sách nhân viên, import hàng loạt từ Excel.",
  },
];

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Tổng quan</h1>
        <p className="text-sm text-zinc-500">Khu vực quản trị hệ thống Team Building.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-colors hover:border-zinc-400">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
