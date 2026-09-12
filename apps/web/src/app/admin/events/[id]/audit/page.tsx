"use client";

import { use } from "react";
import { AuditJobsPanel } from "@/components/domain/audit-jobs-panel";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AuditJobsPanel eventId={Number(id)} />;
}
