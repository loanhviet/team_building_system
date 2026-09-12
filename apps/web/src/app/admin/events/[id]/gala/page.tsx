"use client";

import { use } from "react";
import { GalaAdminPanel } from "@/components/domain/gala-admin-panel";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <GalaAdminPanel eventId={Number(id)} />;
}
