import { Badge } from "@/components/ui/badge";
import { EVENT_STATUS_LABELS } from "@/lib/event-status";
import type { EventStatus } from "@/types/api";

// "outline" deliberately excluded — it's just a border + `text-foreground`
// with no background fill, so it goes near-invisible wherever this badge
// lands on a dark surface (e.g. the employee shell's header bar). Every
// other variant is a filled pill and stays legible on any background.
const VARIANT: Record<EventStatus, "default" | "secondary"> = {
  draft: "secondary",
  registration_open: "default",
  registration_closed: "secondary",
  allocation_processing: "secondary",
  information_published: "default",
  event_started: "default",
  event_completed: "secondary",
};

/** Every screen showing an event's status should use this instead of a bare
 * `<Badge variant="outline">{status}</Badge>` — before this existed, all 7
 * statuses rendered identically (same variant, same raw English-ish value in
 * some places), giving the admin zero visual cue for "still editable" vs
 * "already published" vs "over". */
export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <Badge variant={VARIANT[status]}>{EVENT_STATUS_LABELS[status]}</Badge>;
}
