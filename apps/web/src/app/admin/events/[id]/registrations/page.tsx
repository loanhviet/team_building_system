"use client";

import { use } from "react";
import { RegistrationsTable } from "@/components/domain/registrations-table";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RegistrationsTable eventId={Number(id)} />;
}
