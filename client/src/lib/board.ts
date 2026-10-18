import type { Card, Column } from "../types";
import { isTempId } from "./ids";

// Pure helper functions for board data. They never touch the store, which
// keeps them easy to read and easy to test later.

export function sortByPosition<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

// "Highest position + 1" rather than a count, matching the server: deletions
// leave gaps, and a count could collide with an existing position.
export function nextPosition(items: { position: number }[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((item) => item.position)) + 1;
}

// Insert the item, or replace the one with the same id. Events can arrive twice
// (for example right after a refetch), so applying them must be idempotent.
export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const exists = items.some((existing) => existing.id === item.id);
  return exists
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];
}

// Replace a temporary item with the server's version. If a refetch already
// removed the temporary item, fall back to inserting the real one so a
// successful save can never leave the item missing from the screen.
export function swapById<T extends { id: string }>(items: T[], tempId: string, real: T): T[] {
  if (items.some((item) => item.id === tempId)) {
    return items.map((item) => (item.id === tempId ? real : item));
  }
  return upsertById(items, real);
}

// Replace every card of the given columns with the server's list. Cards that
// are still unsaved (temporary ids) are kept, because the server cannot know
// about them yet.
export function replaceCardsInColumns(
  cards: Card[],
  columnIds: string[],
  incoming: Card[],
): Card[] {
  const kept = cards.filter((card) => !columnIds.includes(card.columnId) || isTempId(card.id));
  return [...kept, ...incoming];
}

// Mirrors what the server does on a move, so the optimistic result matches the
// answer we get back: remove the card, insert it at the index in the target
// column, and renumber positions as 0..n-1 in both affected columns.
export function moveCardLocally(
  cards: Card[],
  cardId: string,
  toColumnId: string,
  toIndex: number,
): Card[] {
  const moving = cards.find((card) => card.id === cardId);
  if (!moving) return cards;

  const fromColumnId = moving.columnId;

  const target = sortByPosition(
    cards.filter((card) => card.columnId === toColumnId && card.id !== cardId),
  );
  const index = Math.max(0, Math.min(toIndex, target.length));
  target.splice(index, 0, { ...moving, columnId: toColumnId });
  const renumberedTarget = target.map((card, position) => ({ ...card, position }));

  const renumberedSource =
    fromColumnId === toColumnId
      ? []
      : sortByPosition(
          cards.filter((card) => card.columnId === fromColumnId && card.id !== cardId),
        ).map((card, position) => ({ ...card, position }));

  const untouched = cards.filter(
    (card) => card.columnId !== toColumnId && card.columnId !== fromColumnId,
  );

  return [...untouched, ...renumberedTarget, ...renumberedSource];
}

// { columnId: [cardId, ...] } with cards in display order. This is the shape
// dnd-kit's sortable lists want, and it is also what the board keeps a working
// copy of while a drag is in progress.
export function groupCardIdsByColumn(columns: Column[], cards: Card[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const column of columns) {
    result[column.id] = [];
  }
  for (const card of sortByPosition(cards)) {
    // Cards pointing at an unknown column are skipped instead of crashing.
    result[card.columnId]?.push(card.id);
  }
  return result;
}
