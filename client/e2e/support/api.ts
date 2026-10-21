import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import type { BoardResponse, BoardSummary, Card, Column, User } from "../../src/types";
import { API_URL } from "./env";

let activeAccessToken: string = "";
let activeBoardId: string = "";

export function setActiveAuth(token: string, boardId: string): void {
  activeAccessToken = token;
  activeBoardId = boardId;
}

export function getActiveAuth(): { accessToken: string; boardId: string } {
  return { accessToken: activeAccessToken, boardId: activeBoardId };
}

export async function registerUser(
  request: APIRequestContext,
  email?: string,
  password = "password123",
): Promise<{ user: User; accessToken: string; refreshToken: string; email: string; password: string }> {
  const userEmail = email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const response = await request.post(`${API_URL}/api/auth/register`, {
    data: { email: userEmail, password },
  });
  expect(response.status()).toBe(201);
  const data = await response.json();

  const setCookie = response.headers()["set-cookie"] || "";
  const cookieMatch = setCookie.match(/refreshToken=([^;]+)/);
  const refreshToken = cookieMatch ? cookieMatch[1] : "";

  return {
    user: data.user,
    accessToken: data.accessToken,
    refreshToken,
    email: userEmail,
    password,
  };
}

export async function getBoards(
  request: APIRequestContext,
  token?: string,
): Promise<BoardSummary[]> {
  const authToken = token || activeAccessToken;
  const response = await request.get(`${API_URL}/api/boards`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as BoardSummary[];
}

export async function createBoard(
  request: APIRequestContext,
  title: string,
  token?: string,
): Promise<BoardSummary> {
  const authToken = token || activeAccessToken;
  const response = await request.post(`${API_URL}/api/boards`, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { title },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as BoardSummary;
}

export async function deleteBoard(
  request: APIRequestContext,
  boardId: string,
  token?: string,
): Promise<void> {
  const authToken = token || activeAccessToken;
  const response = await request.delete(`${API_URL}/api/boards/${boardId}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(response.status()).toBe(204);
}

export async function getBoard(
  request: APIRequestContext,
  token?: string,
  boardId?: string,
): Promise<BoardResponse> {
  const authToken = token || activeAccessToken;
  const targetBoardId = boardId || activeBoardId;
  const response = await request.get(`${API_URL}/api/boards/${targetBoardId}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as BoardResponse;
}

export async function createColumn(
  request: APIRequestContext,
  title: string,
  token?: string,
  boardId?: string,
): Promise<Column> {
  const authToken = token || activeAccessToken;
  const targetBoardId = boardId || activeBoardId;
  const response = await request.post(`${API_URL}/api/boards/${targetBoardId}/columns`, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { title },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as Column;
}

export async function createCard(
  request: APIRequestContext,
  columnId: string,
  title: string,
  token?: string,
  boardId?: string,
): Promise<Card> {
  const authToken = token || activeAccessToken;
  const targetBoardId = boardId || activeBoardId;
  const response = await request.post(`${API_URL}/api/boards/${targetBoardId}/cards`, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { columnId, title, description: "" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as Card;
}

// Empties the test user's boards and creates a fresh test board.
// Deletes ONLY the test user's boards to keep tests isolated.
export async function resetBoard(
  request: APIRequestContext,
  token?: string,
): Promise<string> {
  const authToken = token || activeAccessToken;
  const boards = await getBoards(request, authToken);
  for (const board of boards) {
    await deleteBoard(request, board.id, authToken);
  }
  const created = await createBoard(request, "E2E Board", authToken);
  setActiveAuth(authToken, created.id);
  return created.id;
}
