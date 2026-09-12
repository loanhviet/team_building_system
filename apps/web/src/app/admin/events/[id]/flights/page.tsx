"use client";

import { use } from "react";
import { FlightAllocationPanel } from "@/components/domain/flight-allocation-panel";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <FlightAllocationPanel eventId={Number(id)} />;
}
