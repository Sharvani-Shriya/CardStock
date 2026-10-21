import type { BoardDto, CardDto, ColumnDto } from "./types";

// These describe only the fields we read, so the functions accept both full
// Mongoose documents and plain objects without fighting Mongoose's generics.
interface BoardLike {
  _id: { toString(): string };
  title: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface ColumnLike {
  _id: { toString(): string };
  boardId?: { toString(): string } | null;
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

export function toBoardDto(board: BoardLike): BoardDto {
  const created = board.createdAt instanceof Date ? board.createdAt.toISOString() : (board.createdAt ?? new Date().toISOString());
  const updated = board.updatedAt instanceof Date ? board.updatedAt.toISOString() : (board.updatedAt ?? new Date().toISOString());
  return {
    id: board._id.toString(),
    title: board.title,
    createdAt: created,
    updatedAt: updated,
  };
}

// The API exposes `id` (a string) instead of Mongo's `_id` (an ObjectId) so the
// client never has to know which database we use.
export function toColumnDto(column: ColumnLike): ColumnDto {
  return {
    id: column._id.toString(),
    boardId: column.boardId ? column.boardId.toString() : undefined,
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
