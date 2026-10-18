import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { clientMessageSchema } from "./schemas";
import type { ServerEvent } from "./types";

const HEARTBEAT_INTERVAL_MS = 30_000;

interface ClientInfo {
  clientId: string;
  // Set to false before each ping and back to true when the pong arrives. If it
  // is still false at the next tick, the connection is dead.
  isAlive: boolean;
}

// Module-level on purpose: the REST routes need to call broadcast() without
// having the WebSocket server passed through every layer. Before the server is
// attached (for example when only app.ts is loaded) the map is simply empty,
// so broadcast() does nothing.
const clients = new Map<WebSocket, ClientInfo>();

export function attachWebSocketServer(server: Server): WebSocketServer {
  // Clients only ever send tiny messages, so a small cap protects us from
  // someone sending huge frames.
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });

  wss.on("connection", (socket, request) => {
    // The request URL is relative ("/ws?clientId=..."), so give URL a dummy base.
    const url = new URL(request.url ?? "/ws", "http://localhost");
    const info: ClientInfo = {
      clientId: url.searchParams.get("clientId") ?? "",
      isAlive: true,
    };
    clients.set(socket, info);

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

// Sends an event to every connected client except the one that caused it.
// That client already applied the change optimistically, so echoing it back
// would be redundant and could briefly flicker the UI.
export function broadcast(event: ServerEvent, senderClientId?: string): void {
  const message = JSON.stringify(event);

  for (const [socket, info] of clients) {
    if (senderClientId && info.clientId === senderClientId) continue;
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
