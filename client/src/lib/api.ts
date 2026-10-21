import { API_URL, CLIENT_ID } from "../config";
import { useAuthStore } from "../store/authStore";
import type { AuthResponse, BoardResponse, BoardSummary, Card, Column } from "../types";

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
  _isRetry?: boolean;
}

// Single in-flight refresh promise so parallel 401s coalesce into one POST /api/auth/refresh call.
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "X-Client-Id": CLIENT_ID,
        "Content-Type": "application/json",
      },
      // HttpOnly refresh cookie is sent automatically by the browser
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as AuthResponse;
    useAuthStore.getState().setSession(data.user, data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  } finally {
    refreshPromise = null;
  }
}

// Every API call goes through request() so credentials, Authorization headers,
// single in-flight 401 refresh handling, JSON parsing, and error formatting
// are applied consistently.
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, _isRetry = false } = options;
  const headers: Record<string, string> = { "X-Client-Id": CLIENT_ID };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = useAuthStore.getState().accessToken;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // credentials: "include" sends and receives HttpOnly cookies on all requests
      credentials: "include",
    });
  } catch {
    throw new ApiError("Cannot reach the server.");
  }

  // Handle 401 Unauthorized: attempt a single refresh and retry once.
  // Avoid refreshing if this call was already a refresh attempt or an explicit auth login/register.
  const isAuthRoute = path.startsWith("/api/auth/");
  if (response.status === 401 && !isAuthRoute && !_isRetry) {
    if (!refreshPromise) {
      refreshPromise = performRefresh();
    }

    const newAccessToken = await refreshPromise;
    if (newAccessToken) {
      // Retry the original request with the new access token
      return request<T>(path, { ...options, _isRetry: true });
    }

    // Refresh failed: clear auth state and redirect to /login
    useAuthStore.getState().clearAuth();
    if (
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login") &&
      !window.location.pathname.startsWith("/register")
    ) {
      window.location.href = "/login";
    }
    throw new ApiError("Session expired. Please log in again.", 401);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const data: unknown = await response.json();
      const serverMessage = (data as { error?: { message?: unknown } }).error?.message;
      if (typeof serverMessage === "string") message = serverMessage;
    } catch {
      // The body was not JSON; default to generic message
    }
    throw new ApiError(message, response.status);
  }

  // 204 No Content has no body
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Authentication endpoints
// ---------------------------------------------------------------------------

export function register(body: { email: string; password: string }): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", { method: "POST", body });
}

export function login(body: { email: string; password: string }): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", { method: "POST", body });
}

export function refreshToken(): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/refresh", { method: "POST" });
}

export function logout(): Promise<void> {
  return request<void>("/api/auth/logout", { method: "POST" });
}

export function logoutAll(): Promise<void> {
  return request<void>("/api/auth/logout-all", { method: "POST" });
}

export function getWsTicket(boardId: string): Promise<{ ticket: string }> {
  return request<{ ticket: string }>("/api/auth/ws-ticket", { method: "POST", body: { boardId } });
}

// ---------------------------------------------------------------------------
// Boards endpoints
// ---------------------------------------------------------------------------

export function fetchBoards(): Promise<BoardSummary[]> {
  return request<BoardSummary[]>("/api/boards");
}

export function createBoard(title: string): Promise<BoardSummary> {
  return request<BoardSummary>("/api/boards", { method: "POST", body: { title } });
}

export function renameBoard(boardId: string, title: string): Promise<BoardSummary> {
  return request<BoardSummary>(`/api/boards/${boardId}`, { method: "PATCH", body: { title } });
}

export function deleteBoard(boardId: string): Promise<void> {
  return request<void>(`/api/boards/${boardId}`, { method: "DELETE" });
}

export function fetchBoard(boardId: string): Promise<BoardResponse> {
  return request<BoardResponse>(`/api/boards/${boardId}`);
}

// ---------------------------------------------------------------------------
// Columns endpoints (nested under /api/boards/:boardId/columns)
// ---------------------------------------------------------------------------

export function createColumn(boardId: string, title: string): Promise<Column> {
  return request<Column>(`/api/boards/${boardId}/columns`, { method: "POST", body: { title } });
}

export function updateColumn(
  boardId: string,
  id: string,
  changes: { title: string },
): Promise<Column> {
  return request<Column>(`/api/boards/${boardId}/columns/${id}`, {
    method: "PATCH",
    body: changes,
  });
}

export function deleteColumn(boardId: string, id: string): Promise<void> {
  return request<void>(`/api/boards/${boardId}/columns/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Cards endpoints (nested under /api/boards/:boardId/cards)
// ---------------------------------------------------------------------------

export function createCard(
  boardId: string,
  input: {
    columnId: string;
    title: string;
    description: string;
  },
): Promise<Card> {
  return request<Card>(`/api/boards/${boardId}/cards`, { method: "POST", body: input });
}

export function updateCard(
  boardId: string,
  id: string,
  changes: { title?: string; description?: string },
): Promise<Card> {
  return request<Card>(`/api/boards/${boardId}/cards/${id}`, { method: "PATCH", body: changes });
}

export function deleteCard(boardId: string, id: string): Promise<void> {
  return request<void>(`/api/boards/${boardId}/cards/${id}`, { method: "DELETE" });
}

export function moveCard(
  boardId: string,
  id: string,
  target: { columnId: string; position: number },
): Promise<{ cards: Card[] }> {
  return request<{ cards: Card[] }>(`/api/boards/${boardId}/cards/${id}/move`, {
    method: "PATCH",
    body: target,
  });
}
