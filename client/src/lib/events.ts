import type { ServerEvent } from "../types";

const KNOWN_EVENT_TYPES = new Set<string>([
  "column:created",
  "column:updated",
  "column:deleted",
  "card:created",
  "card:updated",
  "card:deleted",
  "cards:reordered",
]);

// Turns a raw WebSocket message into a ServerEvent, or null if it is not one.
// The socket also carries replies like "pong" and "error", and ignoring
// anything we do not recognise keeps old clients working if the server adds
// new message types later. The server is trusted for the payload itself, so we
// check only the event type, not every field.
export function parseServerEvent(raw: unknown): ServerEvent | null {
  if (typeof raw !== "string") return null;

  try {
    const data: unknown = JSON.parse(raw);
    if (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      typeof data.type === "string" &&
      KNOWN_EVENT_TYPES.has(data.type)
    ) {
      return data as ServerEvent;
    }
  } catch {
    // Not JSON: fall through and ignore it.
  }

  return null;
}
