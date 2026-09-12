import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">404 — Không tìm thấy trang</h1>
      <p className="text-sm text-zinc-500">Trang bạn tìm không tồn tại hoặc đã bị di chuyển.</p>
      <Link href="/" className="mt-2 text-sm text-blue-600 underline">
        Về trang chủ
      </Link>
    </div>
  );
}
