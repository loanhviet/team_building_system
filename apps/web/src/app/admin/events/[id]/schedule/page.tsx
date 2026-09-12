"use client";

import { use } from "react";
import { ScheduleAnnouncementsPanel } from "@/components/domain/schedule-announcements-panel";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ScheduleAnnouncementsPanel eventId={Number(id)} />;
}
