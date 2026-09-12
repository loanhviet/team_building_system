import type { GalaSeat, GalaState } from "@/types/api";

export function applyGalaMessage(prev: GalaState, msg: Record<string, unknown>): GalaState {
  if (msg.type === "seat_update") {
    const status = msg.status as GalaSeat["status"];
    return {
      ...prev,
      seats: prev.seats.map((s) =>
        s.id === msg.seat_id
          ? {
              ...s,
              status,
              held_by_team_id: (msg.held_by_team_id as number | undefined) ?? null,
              // every status other than "held" genuinely has no hold server-side;
              // only "held" ever carries hold_expires_at in the message
              hold_expires_at:
                status === "held" ? ((msg.hold_expires_at as string | undefined) ?? null) : null,
              team_id: (msg.team_id as number | undefined) ?? s.team_id,
            }
          : s,
      ),
    };
  }
  if (msg.type === "turn_update") {
    return {
      ...prev,
      turns: prev.turns.map((t) => {
        if (t.team_id === msg.team_id) {
          return { ...t, status: "active", expires_at: (msg.expires_at as string | null) ?? null };
        }
        if (t.status === "active") {
          return { ...t, status: "done" };
        }
        return t;
      }),
      config: prev.config
        ? { ...prev.config, status: msg.finished ? "finished" : "in_progress" }
        : prev.config,
    };
  }
  if (msg.type === "table_update") {
    return {
      ...prev,
      tables: prev.tables.map((t) =>
        t.id === msg.table_id ? { ...t, x: msg.x as number, y: msg.y as number } : t,
      ),
    };
  }
  return prev;
}
