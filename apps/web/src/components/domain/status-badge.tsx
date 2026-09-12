import { Badge } from "@/components/ui/badge";
import { EVENT_STATUS_LABELS } from "@/lib/event-status";
import type { EventStatus } from "@/types/api";

const VARIANT: Record<EventStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  registration_open: "default",
  registration_closed: "secondary",
  allocation_processing: "secondary",
  information_published: "default",
  event_started: "default",
  event_completed: "outline",
};

/** Every screen showing an event's status should use this instead of a bare
 * `<Badge variant="outline">{status}</Badge>` — before this existed, all 7
 * statuses rendered identically (same variant, same raw English-ish value in
 * some places), giving the admin zero visual cue for "still editable" vs
 * "already published" vs "over". */
export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <Badge variant={VARIANT[status]}>{EVENT_STATUS_LABELS[status]}</Badge>;
}
