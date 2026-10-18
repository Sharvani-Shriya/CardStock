// Shapes sent over the wire. The client keeps a copy of these in
// client/src/types.ts, so change both files together.

export interface ColumnDto {
  id: string;
  title: string;
  position: number;
}

export interface CardDto {
  id: string;
  columnId: string;
  title: string;
  description: string;
  position: number;
}

// Every real-time event the server can broadcast. `type` is the discriminator,
// which lets TypeScript narrow the payload in a switch statement.
export type ServerEvent =
  | { type: "column:created"; column: ColumnDto }
  | { type: "column:updated"; column: ColumnDto }
  | { type: "column:deleted"; id: string }
  | { type: "card:created"; card: CardDto }
  | { type: "card:updated"; card: CardDto }
  | { type: "card:deleted"; id: string; columnId: string }
  // columnIds tells receivers which columns to replace wholesale, which matters
  // when a column ends up empty and therefore has no cards in the list.
  | { type: "cards:reordered"; columnIds: string[]; cards: CardDto[] };
