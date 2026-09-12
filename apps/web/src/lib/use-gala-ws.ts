import { useEffect, useRef } from "react";
import { getAccessToken } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useGalaWebSocket(eventId: number, onMessage: (data: unknown) => void) {
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    const base = `${API_URL.replace(/^http/, "ws")}/api/events/${eventId}/gala/ws`;
    let ws: WebSocket | null = null;
    let closedByCleanup = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      // WebSocket handshakes can't carry an Authorization header — the access
      // token is relayed as a query param instead; the backend rejects the
      // connection (close code 4401) without one.
      const token = getAccessToken();
      const wsUrl = token ? `${base}?token=${encodeURIComponent(token)}` : base;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          onMessageRef.current(JSON.parse(event.data));
        } catch {
          // ignore malformed messages
        }
      };
      ws.onclose = () => {
        if (!closedByCleanup) {
          retryTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [eventId]);
}
