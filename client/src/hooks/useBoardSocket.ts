import { useEffect } from "react";
import { CLIENT_ID, WS_URL } from "../config";
import { parseServerEvent } from "../lib/events";
import { useBoardStore } from "../store/boardStore";
import { useConnectionStore } from "../store/connectionStore";

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

// Exponential backoff: 0.5s, 1s, 2s, 4s ... capped at 15s. The delay is
// randomised between half and the full value ("jitter") so that when the
// server restarts, hundreds of browsers do not all retry at the same instant.
function backoffDelay(attempt: number): number {
  const capped = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return capped / 2 + Math.random() * (capped / 2);
}

// Keeps one WebSocket open for as long as the component is mounted and applies
// incoming events to the board store.
export function useBoardSocket(): void {
  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;
    // Set by the cleanup function. Without it, closing the socket on unmount
    // would be mistaken for a network failure and trigger a reconnect.
    let stopped = false;

    function connect(): void {
      const url = `${WS_URL}?clientId=${encodeURIComponent(CLIENT_ID)}`;
      const current = new WebSocket(url);
      socket = current;

      current.onopen = () => {
        attempt = 0;
        useConnectionStore.getState().setStatus("connected");
        // Events broadcast while we were disconnected are gone for good, so
        // reload the whole board to catch up on everything we missed.
        void useBoardStore.getState().loadBoard({ quiet: true });
      };

      current.onmessage = (message: MessageEvent) => {
        const event = parseServerEvent(message.data);
        if (event) useBoardStore.getState().applyEvent(event);
      };

      current.onerror = () => {
        // Browsers give no useful detail here. Closing makes sure onclose runs,
        // which is where the retry is scheduled.
        current.close();
      };

      current.onclose = () => {
        if (stopped) return;
        useConnectionStore.getState().setStatus("reconnecting");
        retryTimer = window.setTimeout(connect, backoffDelay(attempt));
        attempt += 1;
      };
    }

    connect();

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);
}
