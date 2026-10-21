// Shapes sent over the wire. These mirror server/src/types.ts, so change both
// files together.

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface BoardSummary {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Column {
  id: string;
  boardId?: string;
  title: string;
  position: number;
}

export interface Card {
  id: string;
  boardId?: string;
  columnId: string;
  title: string;
  description: string;
  position: number;
}

export interface BoardResponse {
  board?: BoardSummary;
  columns: Column[];
  cards: Card[];
}

export type ServerEvent =
  | { type: "column:created"; column: Column }
  | { type: "column:updated"; column: Column }
  | { type: "column:deleted"; id: string }
  | { type: "card:created"; card: Card }
  | { type: "card:updated"; card: Card }
  | { type: "card:deleted"; id: string; columnId: string }
  | { type: "cards:reordered"; columnIds: string[]; cards: Card[] };
