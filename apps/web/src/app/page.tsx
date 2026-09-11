"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export default function Home() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<{ status: string }>("/api/health"),
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Team Building System
      </h1>
      <p className="text-sm text-zinc-500">
        {isLoading && "Đang kiểm tra kết nối API..."}
        {isError && `Không kết nối được API: ${(error as Error).message}`}
        {data && `API status: ${data.status}`}
      </p>
    </div>
  );
}
