"use client";

import { use, type ReactNode } from "react";
import { EventWorkspace } from "@/components/domain/event-workspace";

export default function EventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <EventWorkspace eventId={Number(id)}>{children}</EventWorkspace>;
}
