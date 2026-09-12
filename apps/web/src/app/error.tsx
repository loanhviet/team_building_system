"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">Đã có lỗi xảy ra</h1>
      <p className="max-w-md text-sm text-zinc-500">
        Vui lòng thử lại. Nếu lỗi tiếp diễn, liên hệ BTC.
      </p>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}
