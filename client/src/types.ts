// Shapes sent over the wire. These mirror server/src/types.ts, so change both
// files together.

export interface Column {
  id: string;
  title: string;
  position: number;
}

export interface Card {
  id: string;
  columnId: string;
  title: string;
  description: string;
  position: number;
}

export interface BoardResponse {
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
