import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import type { BoardResponse, Card, Column } from "../../src/types";
import { API_URL } from "./env";

// Tests prepare their data through the REST API instead of clicking through the
// UI. It is much faster and, more importantly, a failure while preparing data
// is reported as exactly that, rather than as a confusing UI failure.
// These requests carry no X-Client-Id header, so every open window would
// receive them as events. Tests therefore seed data BEFORE opening a window.

export async function getBoard(request: APIRequestContext): Promise<BoardResponse> {
  const response = await request.get(`${API_URL}/api/board`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as BoardResponse;
}

export async function createColumn(request: APIRequestContext, title: string): Promise<Column> {
  const response = await request.post(`${API_URL}/api/columns`, { data: { title } });
  expect(response.status()).toBe(201);
  return (await response.json()) as Column;
}

export async function createCard(
  request: APIRequestContext,
  columnId: string,
  title: string,
): Promise<Card> {
  const response = await request.post(`${API_URL}/api/cards`, {
    data: { columnId, title, description: "" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as Card;
}

// Deleting a column also deletes its cards on the server, so removing every
// column leaves a completely empty board.
export async function resetBoard(request: APIRequestContext): Promise<void> {
  const board = await getBoard(request);
  for (const column of board.columns) {
    const response = await request.delete(`${API_URL}/api/columns/${column.id}`);
    expect(response.status()).toBe(204);
  }
}
