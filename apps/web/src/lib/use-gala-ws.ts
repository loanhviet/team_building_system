import { useEffect, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useGalaWebSocket(eventId: number, onMessage: (data: unknown) => void) {
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    const wsUrl = `${API_URL.replace(/^http/, "ws")}/api/events/${eventId}/gala/ws`;
    let ws: WebSocket | null = null;
    let closedByCleanup = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
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
