"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { jobStatusLabel } from "@/lib/labels";
import type { Job } from "@/types/api";

/**
 * Polls GET /api/jobs/{id} and renders a progress line — reuses the pattern
 * already in admin/employees/page.tsx (the one screen that had real feedback
 * for a long-running job) so flight/bus allocation stop being a static
 * "Đang chạy phân bổ..." string with no progress, no elapsed time, no result.
 */
export function JobProgress({ jobId }: { jobId: number | null }) {
  const { data: job } = useQuery({
    queryKey: ["jobs", jobId],
    queryFn: () => apiFetch<Job>(`/api/jobs/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "succeeded" || status === "failed" ? false : 1200;
    },
  });

  if (!job) return null;

  if (job.status === "queued" || job.status === "running") {
    const pct = job.total ? Math.round((job.progress / job.total) * 100) : null;
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-muted-foreground">
          {jobStatusLabel(job.status)}
          {pct !== null && ` — ${job.progress}/${job.total} (${pct}%)`}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: pct !== null ? `${pct}%` : "30%" }}
          />
        </div>
      </div>
    );
  }

  if (job.status === "failed") {
    return <p className="text-sm text-destructive">Thất bại: {job.error ?? "Không rõ lý do"}</p>;
  }

  return null; // "succeeded" — the caller renders its own result (summary, batch errors, ...)
}
