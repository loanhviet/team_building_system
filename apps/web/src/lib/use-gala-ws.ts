import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useGalaWebSocket(
  eventId: number,
  onMessage: (data: unknown) => void,
  onOpen?: () => void,
): { connected: boolean } {
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });
  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  const [connected, setConnected] = useState(false);

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
      ws.onopen = () => {
        setConnected(true);
        // reconnecting after a drop means every message missed in between is
        // gone for good — refetch the real state instead of trusting the
        // stale cache to still match the server
        onOpenRef.current?.();
      };
      ws.onmessage = (event) => {
        try {
          onMessageRef.current(JSON.parse(event.data));
        } catch {
          // ignore malformed messages
        }
      };
      ws.onclose = () => {
        setConnected(false);
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
      setConnected(false);
    };
  }, [eventId]);

  return { connected };
}
