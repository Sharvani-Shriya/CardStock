import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { clientMessageSchema } from "./schemas";
import type { ServerEvent } from "./types";

const HEARTBEAT_INTERVAL_MS = 30_000;

interface ClientInfo {
  clientId: string;
  userId?: string;
  boardId?: string;
  // Set to false before each ping and back to true when the pong arrives. If it
  // is still false at the next tick, the connection is dead.
  isAlive: boolean;
}

interface WsTicket {
  ticket: string;
  userId: string;
  boardId: string;
  expiresAt: number;
}

const clients = new Map<WebSocket, ClientInfo>();
const wsTickets = new Map<string, WsTicket>();

export function issueWsTicket(userId: string, boardId: string): string {
  const ticket = randomUUID();
  wsTickets.set(ticket, { ticket, userId, boardId, expiresAt: Date.now() + 30_000 });
  return ticket;
}

// Clean up expired tickets periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of wsTickets) {
    if (item.expiresAt <= now) {
      wsTickets.delete(key);
    }
  }
}, 30_000);

export function attachWebSocketServer(server: Server): WebSocketServer {
  // Clients only ever send tiny messages, so a small cap protects us from
  // someone sending huge frames.
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });

  wss.on("connection", (socket, request) => {
    // The request URL is relative ("/ws?clientId=..."), so give URL a dummy base.
    const url = new URL(request.url ?? "/ws", "http://localhost");
    const clientId = url.searchParams.get("clientId") ?? "";
    const ticketParam = url.searchParams.get("ticket");

    let userId: string | undefined;
    let boardId: string | undefined;

    if (ticketParam) {
      const stored = wsTickets.get(ticketParam);
      if (!stored) {
        socket.close(4003, "Invalid or reused ticket");
        return;
      }
      if (stored.expiresAt <= Date.now()) {
        wsTickets.delete(ticketParam);
        socket.close(4002, "Expired ticket");
        return;
      }
      // Valid ticket: consume immediately so it cannot be reused
      userId = stored.userId;
      boardId = stored.boardId;
      wsTickets.delete(ticketParam);
    }

    const info: ClientInfo = {
      clientId,
      userId,
      boardId,
      isAlive: true,
    };
    clients.set(socket, info);

    // If connection was opened without a ticket, close within 5s
    if (!userId) {
      const timer = setTimeout(() => {
        if (!info.userId) {
          socket.terminate();
          clients.delete(socket);
        }
      }, 5000);
      socket.on("close", () => clearTimeout(timer));
    }

    socket.on("pong", () => {
      info.isAlive = true;
    });

    socket.on("message", (raw) => {
      handleClientMessage(socket, raw.toString());
    });

    socket.on("close", () => {
      clients.delete(socket);
    });

    // Without a listener, an error event would crash the whole process.
    // A "close" event always follows, which does the cleanup.
    socket.on("error", (error) => {
      console.error("WebSocket error:", error.message);
    });
  });

  // Half-open connections (laptop lid closed, Wi-Fi dropped) never fire "close"
  // on their own. Pinging and terminating silent sockets stops them piling up.
  const heartbeat = setInterval(() => {
    for (const [socket, info] of clients) {
      if (!info.isAlive) {
        socket.terminate();
        clients.delete(socket);
        continue;
      }
      info.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  return wss;
}

// Sends an event to connected clients.
// If boardId is provided, sends ONLY to clients tuned to the same board.
// Skips the senderClientId so optimistic UI isn't flickered.
export function broadcast(event: ServerEvent, senderClientId?: string, boardId?: string): void {
  const message = JSON.stringify(event);

  for (const [socket, info] of clients) {
    if (senderClientId && info.clientId === senderClientId) continue;
    if (boardId && info.boardId && info.boardId !== boardId) continue;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  }
}

function handleClientMessage(socket: WebSocket, raw: string): void {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    socket.send(JSON.stringify({ type: "error", message: "Message must be valid JSON" }));
    return;
  }

  // Never trust data from the network: validate before acting on it.
  const parsed = clientMessageSchema.safeParse(json);
  if (!parsed.success) {
    socket.send(JSON.stringify({ type: "error", message: "Unknown message" }));
    return;
  }

  socket.send(JSON.stringify({ type: "pong" }));
}
