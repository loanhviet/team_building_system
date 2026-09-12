"use client";

import { use } from "react";
import { BusAllocationPanel } from "@/components/domain/bus-allocation-panel";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BusAllocationPanel eventId={Number(id)} />;
}
