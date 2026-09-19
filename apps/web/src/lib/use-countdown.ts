import { useEffect, useState } from "react";
import { parseApiDateTime } from "@/lib/format";

/** Seconds remaining until `expiresAt`, ticking every second; null when
 * there's nothing to count down to. Shared by the CBNV and admin Gala
 * screens (turn countdown, seat-hold countdown, admin's active-turn view). */
export function useCountdown(expiresAt: string | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      if (!expiresAt) {
        setRemaining(null);
        return;
      }
      setRemaining(Math.max(0, Math.round((parseApiDateTime(expiresAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    if (!expiresAt) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}
