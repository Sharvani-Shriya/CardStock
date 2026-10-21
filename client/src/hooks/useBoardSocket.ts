import { useEffect } from "react";
import { CLIENT_ID, WS_URL } from "../config";
import * as api from "../lib/api";
import { parseServerEvent } from "../lib/events";
import { useAuthStore } from "../store/authStore";
import { useBoardStore } from "../store/boardStore";
import { useConnectionStore } from "../store/connectionStore";

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

// Exponential backoff: 0.5s, 1s, 2s, 4s ... capped at 15s. Delay is randomised
// between half and the full value ("jitter") so that when the server restarts,
// many clients do not retry at the exact same instant.
function backoffDelay(attempt: number): number {
  const capped = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return capped / 2 + Math.random() * (capped / 2);
}

// Keeps one WebSocket open for as long as a board is active and the user is logged in.
// Authenticates via a single-use ws-ticket obtained before each connection or reconnect.
export function useBoardSocket(boardId: string | undefined): void {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    // Cannot connect without a target board and authenticated session
    if (!boardId || !user || !accessToken) {
      useConnectionStore.getState().setStatus("connecting");
      return;
    }

    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;
    // Set by the cleanup function to prevent unmount from being mistaken for a drop.
    let stopped = false;

    async function connect(): Promise<void> {
      if (stopped) return;

      try {
        // Fetch a single-use ticket right before connecting.
        // Tickets cannot be replayed, so every reconnect must acquire a fresh one.
        const { ticket } = await api.getWsTicket(boardId!);
        if (stopped) return;

        const url = `${WS_URL}?ticket=${encodeURIComponent(ticket)}&clientId=${encodeURIComponent(
          CLIENT_ID,
        )}&boardId=${encodeURIComponent(boardId!)}`;

        const current = new WebSocket(url);
        socket = current;

        current.onopen = () => {
          attempt = 0;
          useConnectionStore.getState().setStatus("connected");
          // Re-sync the board to catch up on any events broadcast while disconnected
          void useBoardStore.getState().loadBoard(boardId, { quiet: true });
        };

        current.onmessage = (message: MessageEvent) => {
          const event = parseServerEvent(message.data);
          if (event) useBoardStore.getState().applyEvent(event);
        };

        current.onerror = () => {
          current.close();
        };

        current.onclose = () => {
          if (stopped) return;
          useConnectionStore.getState().setStatus("reconnecting");
          retryTimer = window.setTimeout(() => {
            void connect();
          }, backoffDelay(attempt));
          attempt += 1;
        };
      } catch {
        // Failed to get a ticket (e.g. server down or network failure); schedule retry
        if (stopped) return;
        useConnectionStore.getState().setStatus("reconnecting");
        retryTimer = window.setTimeout(() => {
          void connect();
        }, backoffDelay(attempt));
        attempt += 1;
      }
    }

    void connect();

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [boardId, user, accessToken]);
}
