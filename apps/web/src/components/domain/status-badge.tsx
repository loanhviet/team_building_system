import { StatusChip, type StatusKind } from "@/components/domain/status-chip";
import { EVENT_STATUS_LABELS } from "@/lib/event-status";
import type { EventStatus } from "@/types/api";

const KIND: Record<EventStatus, StatusKind> = {
  draft: "unavailable",
  registration_open: "empty",
  registration_closed: "unavailable",
  allocation_processing: "locking",
  information_published: "confirmed",
  event_started: "empty",
  event_completed: "unavailable",
};

/** Every screen showing an event's status should use this instead of a bare
 * Badge with the raw enum — 7 statuses need distinct token+icon+label. */
export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <StatusChip kind={KIND[status]} label={EVENT_STATUS_LABELS[status]} />;
}
