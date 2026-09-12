"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "admin:currentEventId";

/** Remembers which event the admin sidebar's event picker last pointed at,
 * across page loads — without this, every visit to /admin required going
 * back through /admin/events to pick the event again before reaching any
 * of its sub-tabs. */
export function useCurrentEventId(): [number | null, (id: number) => void] {
  const [id, setId] = useState<number | null>(null);

  useEffect(() => {
    // Reading localStorage during render would crash on the server and risk
    // a hydration mismatch; syncing it in an effect after mount is the
    // standard safe pattern for browser-only storage, even though it's one
    // synchronous setState call on mount (not the derived-from-props loop
    // the lint rule below is really guarding against).
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setId(Number(stored));
    } catch {
      // private-mode / storage disabled — just start with nothing remembered
    }
  }, []);

  const update = (next: number) => {
    setId(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore — nothing to persist, still works for this tab's session
    }
  };

  return [id, update];
}
