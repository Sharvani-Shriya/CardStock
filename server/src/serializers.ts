import type { CardDto, ColumnDto } from "./types";

// These describe only the fields we read, so the functions accept both full
// Mongoose documents and plain objects without fighting Mongoose's generics.
interface ColumnLike {
  _id: { toString(): string };
  title: string;
  position: number;
}

interface CardLike {
  _id: { toString(): string };
  columnId: { toString(): string };
  title: string;
  description?: string | null;
  position: number;
}

// The API exposes `id` (a string) instead of Mongo's `_id` (an ObjectId) so the
// client never has to know which database we use.
export function toColumnDto(column: ColumnLike): ColumnDto {
  return {
    id: column._id.toString(),
    title: column.title,
    position: column.position,
  };
}

export function toCardDto(card: CardLike): CardDto {
  return {
    id: card._id.toString(),
    columnId: card.columnId.toString(),
    title: card.title,
    description: card.description ?? "",
    position: card.position,
  };
}
