import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="font-display text-2xl font-semibold">Không tìm thấy trang</h1>
      <p className="text-sm text-muted-foreground">
        Trang không tồn tại hoặc đã bị di chuyển.
      </p>
      <Link href="/" className={cn(buttonVariants(), "mt-1 min-h-11")}>
        Về trang chủ
      </Link>
    </div>
  );
}
