import { makeId } from "./lib/ids";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

export const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:4000/ws";

// Generated once per page load. It is sent with every request and with the
// WebSocket URL so the server can skip this browser tab when it broadcasts, and
// two tabs of the same browser therefore count as two different clients.
export const CLIENT_ID = makeId();
