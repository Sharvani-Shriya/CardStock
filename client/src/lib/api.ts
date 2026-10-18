import { API_URL, CLIENT_ID } from "../config";
import type { BoardResponse, Card, Column } from "../types";

export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

// Every call goes through here so the client id header, JSON handling and error
// format are written exactly once.
async function request<T>(path: string, { method = "GET", body }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Client-Id": CLIENT_ID };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects when the request never got an answer (server down, offline).
    throw new ApiError("Cannot reach the server.");
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const data: unknown = await response.json();
      const serverMessage = (data as { error?: { message?: unknown } }).error?.message;
      if (typeof serverMessage === "string") message = serverMessage;
    } catch {
      // The body was not JSON; the generic message above is good enough.
    }
    throw new ApiError(message, response.status);
  }

  // DELETE answers 204 No Content, which has no body to parse.
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export function fetchBoard(): Promise<BoardResponse> {
  return request<BoardResponse>("/api/board");
}

export function createColumn(title: string): Promise<Column> {
  return request<Column>("/api/columns", { method: "POST", body: { title } });
}

export function updateColumn(id: string, changes: { title: string }): Promise<Column> {
  return request<Column>(`/api/columns/${id}`, { method: "PATCH", body: changes });
}

export function deleteColumn(id: string): Promise<void> {
  return request<void>(`/api/columns/${id}`, { method: "DELETE" });
}

export function createCard(input: {
  columnId: string;
  title: string;
  description: string;
}): Promise<Card> {
  return request<Card>("/api/cards", { method: "POST", body: input });
}

export function updateCard(
  id: string,
  changes: { title?: string; description?: string },
): Promise<Card> {
  return request<Card>(`/api/cards/${id}`, { method: "PATCH", body: changes });
}

export function deleteCard(id: string): Promise<void> {
  return request<void>(`/api/cards/${id}`, { method: "DELETE" });
}

export function moveCard(
  id: string,
  target: { columnId: string; position: number },
): Promise<{ cards: Card[] }> {
  return request<{ cards: Card[] }>(`/api/cards/${id}/move`, { method: "PATCH", body: target });
}
