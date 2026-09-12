"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // staleTime: 0 (react-query's default) meant every navigation back
          // to a screen refetched immediately, even for data that rarely
          // changes between clicks — 30s cuts that without going stale for
          // anything a human would notice.
          queries: { staleTime: 30_000 },
        },
        queryCache: new QueryCache({
          // Catches whatever a query doesn't already handle inline. A query
          // that renders its own error UI (EmptyState variant="error", an
          // inline message) can opt out with `meta: { silent: true }` so the
          // same failure isn't reported twice.
          onError: (error, query) => {
            if (query.meta?.silent) return;
            toast.error(error instanceof ApiError ? error.message : "Có lỗi xảy ra, vui lòng thử lại.");
          },
        }),
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
