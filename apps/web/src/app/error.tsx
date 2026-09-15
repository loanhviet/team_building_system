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
      <h1 className="font-display text-2xl font-semibold">Không tải được trang</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Thử lại. Nếu vẫn lỗi, liên hệ BTC.
      </p>
      <Button className="min-h-11" onClick={reset}>
        Thử lại
      </Button>
    </div>
  );
}
