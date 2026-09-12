"use client";

import { use } from "react";
import { EventDashboard } from "@/components/domain/event-dashboard";

export default function EventOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EventDashboard eventId={Number(id)} />;
}
