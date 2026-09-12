"use client";

import { use } from "react";
import { HotelRoomsPanel } from "@/components/domain/hotel-rooms-panel";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <HotelRoomsPanel eventId={Number(id)} />;
}
