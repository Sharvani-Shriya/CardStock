import { vi } from "vitest";
import { sortByPosition } from "../lib/board";
import { useBoardStore } from "../store/boardStore";
import { useConnectionStore } from "../store/connectionStore";
import { useToastStore } from "../store/toastStore";
import type { Card, Column } from "../types";

// ---------------------------------------------------------------------------
// Fixtures and store helpers
// ---------------------------------------------------------------------------

// Only `id` is required. Everything else gets a harmless default, so each test
// spells out just the fields it actually cares about.
export function makeColumn(fields: Pick<Column, "id"> & Partial<Column>): Column {
  return { title: `Column ${fields.id}`, position: 0, ...fields };
}

export function makeCard(fields: Pick<Card, "id"> & Partial<Card>): Card {
  return {
    columnId: "col-todo",
    title: `Card ${fields.id}`,
    description: "",
    position: 0,
    ...fields,
  };
}

// Describes one column as "id@position" strings in display order, for example
// ["a2@0", "a3@1"]. A single toEqual on this proves the order AND the
// renumbering at once, and a failing diff is easy to read.
export function layoutOf(cards: Card[], columnId: string): string[] {
  return sortByPosition(cards.filter((card) => card.columnId === columnId)).map(
    (card) => `${card.id}@${card.position}`,
  );
}

// The Zustand stores are module-level singletons, so without a reset the state
// of one test would leak into the next one.
export function resetStores(): void {
  useBoardStore.setState({ columns: [], cards: [], status: "loading", errorMessage: null });
  useToastStore.setState({ toasts: [] });
  useConnectionStore.setState({ status: "connecting" });
}

// ---------------------------------------------------------------------------
// Fake fetch
// ---------------------------------------------------------------------------

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
  headers: Headers;
}

// A handler may return a promise, which lets a test keep a request "in flight"
// and decide exactly when (and how) the server answers.
export type Handler = (call: ApiCall) => Response | Promise<Response>;

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Replaces global fetch. Routes are keyed as "METHOD /path", for example
// "GET /api/board". Every call is recorded so tests can check what was sent.
// Handlers are functions (not ready-made Responses) because a Response body can
// only be read once, and the same route may be called several times.
export function mockFetch(handlers: Record<string, Handler>): ApiCall[] {
  const calls: ApiCall[] = [];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const { pathname } = new URL(href);
      const method = init?.method ?? "GET";
      const rawBody = init?.body;

      calls.push({
        method,
        path: pathname,
        body: typeof rawBody === "string" ? (JSON.parse(rawBody) as unknown) : undefined,
        headers: new Headers(init?.headers),
      });

      const handler = handlers[`${method} ${pathname}`];
      // An unexpected request should fail loudly and name itself, not hang or pass silently.
      if (!handler) {
        return jsonResponse(404, { error: { message: `No mock for ${method} ${pathname}` } });
      }
      return handler(calls[calls.length - 1]);
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

export function countRequests(calls: ApiCall[], method: string, path: string): number {
  return calls.filter((call) => call.method === method && call.path === path).length;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

// A promise we settle by hand. It is how a test freezes the app in the moment
// "the request was sent but the server has not answered yet", which is exactly
// when an optimistic update is visible.
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Fake WebSocket
// ---------------------------------------------------------------------------

// Stands in for the browser's WebSocket. Nothing connects by itself: a test
// calls simulateOpen / simulateMessage / simulateClose, so connection timing is
// fully under its control and no server is needed.
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // The reconnect logic creates a brand new socket each time, so tests need
    // the whole list to pick the latest one.
    FakeWebSocket.instances.push(this);
  }

  // The real close() ends in a "close" event; the app's cleanup relies on that.
  close(): void {
    this.onclose?.(new Event("close"));
  }

  simulateOpen(): void {
    this.onopen?.(new Event("open"));
  }

  // The server sends JSON text, so the fake does too.
  simulateMessage(payload: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(payload) }));
  }

  simulateClose(): void {
    this.close();
  }
}

export function installFakeWebSocket(): void {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
}
