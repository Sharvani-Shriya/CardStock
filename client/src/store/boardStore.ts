import { create } from "zustand";
import * as api from "../lib/api";
import {
  moveCardLocally,
  nextPosition,
  replaceCardsInColumns,
  swapById,
  upsertById,
} from "../lib/board";
import { isTempId, makeTempId } from "../lib/ids";
import type { Card, Column, ServerEvent } from "../types";
import { useToastStore } from "./toastStore";

type LoadStatus = "loading" | "ready" | "error";

interface BoardData {
  columns: Column[];
  cards: Card[];
}

interface BoardState extends BoardData {
  currentBoardId: string | null;
  status: LoadStatus;
  errorMessage: string | null;

  setBoardId: (boardId: string) => void;
  loadBoard: (boardId?: string, options?: { quiet?: boolean }) => Promise<void>;
  addColumn: (title: string) => Promise<void>;
  renameColumn: (id: string, title: string) => Promise<void>;
  deleteColumn: (id: string) => Promise<void>;
  addCard: (columnId: string, title: string, description: string) => Promise<void>;
  editCard: (id: string, changes: { title: string; description: string }) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  moveCard: (id: string, columnId: string, index: number) => Promise<void>;
  applyEvent: (event: ServerEvent) => void;
}

// Module-level bookkeeping for the sync logic below.
let latestLoadId = 0; // ignores board responses that a newer request has overtaken
let pendingMutations = 0; // optimistic changes still waiting for the server
let resyncAfterMutations = false; // a refetch was held back and must run when idle

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export const useBoardStore = create<BoardState>()((set, get) => {
  // Optimistic update with automatic rollback and quiet sync on settled state.
  async function optimistic<T>(options: {
    failureMessage: string;
    change: (data: BoardData) => BoardData;
    send: () => Promise<T>;
    onSuccess?: (result: T) => void;
  }): Promise<void> {
    const previous: BoardData = { columns: get().columns, cards: get().cards };

    pendingMutations += 1;
    set(options.change(previous));

    try {
      const result = await options.send();
      options.onSuccess?.(result);
    } catch (error) {
      set(previous);
      resyncAfterMutations = true;
      useToastStore.getState().push(`${options.failureMessage} ${errorText(error)}`);
    } finally {
      pendingMutations -= 1;
      if (pendingMutations === 0 && resyncAfterMutations) {
        resyncAfterMutations = false;
        void get().loadBoard(undefined, { quiet: true });
      }
    }
  }

  return {
    currentBoardId: null,
    columns: [],
    cards: [],
    status: "loading",
    errorMessage: null,

    setBoardId: (boardId: string) => {
      if (get().currentBoardId !== boardId) {
        set({ currentBoardId: boardId, columns: [], cards: [], status: "loading" });
      }
    },

    loadBoard: async (boardId?: string, { quiet = false } = {}) => {
      const activeBoardId = boardId ?? get().currentBoardId;
      if (!activeBoardId) return;

      if (boardId && boardId !== get().currentBoardId) {
        set({ currentBoardId: boardId, columns: [], cards: [] });
      }

      const requestId = ++latestLoadId;
      if (!quiet) set({ status: "loading", errorMessage: null });

      try {
        const board = await api.fetchBoard(activeBoardId);
        if (requestId !== latestLoadId) return;

        if (pendingMutations > 0) {
          resyncAfterMutations = true;
          return;
        }

        set({ columns: board.columns, cards: board.cards, status: "ready", errorMessage: null });
      } catch (error) {
        if (requestId !== latestLoadId) return;
        if (!quiet || get().status === "loading") {
          set({ status: "error", errorMessage: errorText(error) });
        }
      }
    },

    addColumn: async (title) => {
      const boardId = get().currentBoardId;
      if (!boardId) return;

      const tempId = makeTempId();
      const position = nextPosition(get().columns);

      await optimistic({
        failureMessage: "Couldn't add the column.",
        change: (data) => ({
          ...data,
          columns: [...data.columns, { id: tempId, boardId, title, position }],
        }),
        send: () => api.createColumn(boardId, title),
        onSuccess: (created) => {
          set((state) => ({ columns: swapById(state.columns, tempId, created) }));
        },
      });
    },

    renameColumn: async (id, title) => {
      const boardId = get().currentBoardId;
      if (!boardId || isTempId(id)) return;

      await optimistic({
        failureMessage: "Couldn't rename the column.",
        change: (data) => ({
          ...data,
          columns: data.columns.map((column) => (column.id === id ? { ...column, title } : column)),
        }),
        send: () => api.updateColumn(boardId, id, { title }),
      });
    },

    deleteColumn: async (id) => {
      const boardId = get().currentBoardId;
      if (!boardId || isTempId(id)) return;

      await optimistic({
        failureMessage: "Couldn't delete the column.",
        change: (data) => ({
          columns: data.columns.filter((column) => column.id !== id),
          cards: data.cards.filter((card) => card.columnId !== id),
        }),
        send: () => api.deleteColumn(boardId, id),
      });
    },

    addCard: async (columnId, title, description) => {
      const boardId = get().currentBoardId;
      if (!boardId || isTempId(columnId)) return;

      const tempId = makeTempId();
      const position = nextPosition(get().cards.filter((card) => card.columnId === columnId));

      await optimistic({
        failureMessage: "Couldn't add the card.",
        change: (data) => ({
          ...data,
          cards: [...data.cards, { id: tempId, boardId, columnId, title, description, position }],
        }),
        send: () => api.createCard(boardId, { columnId, title, description }),
        onSuccess: (created) => {
          set((state) => ({ cards: swapById(state.cards, tempId, created) }));
        },
      });
    },

    editCard: async (id, changes) => {
      const boardId = get().currentBoardId;
      if (!boardId || isTempId(id)) return;

      await optimistic({
        failureMessage: "Couldn't save the card.",
        change: (data) => ({
          ...data,
          cards: data.cards.map((card) => (card.id === id ? { ...card, ...changes } : card)),
        }),
        send: () => api.updateCard(boardId, id, changes),
      });
    },

    deleteCard: async (id) => {
      const boardId = get().currentBoardId;
      if (!boardId || isTempId(id)) return;

      await optimistic({
        failureMessage: "Couldn't delete the card.",
        change: (data) => ({ ...data, cards: data.cards.filter((card) => card.id !== id) }),
        send: () => api.deleteCard(boardId, id),
      });
    },

    moveCard: async (id, columnId, index) => {
      const boardId = get().currentBoardId;
      const card = get().cards.find((item) => item.id === id);
      if (!boardId || !card || isTempId(id)) return;

      if (isTempId(columnId)) {
        useToastStore.getState().push("That column is still being created. Try again in a moment.");
        return;
      }

      const affectedColumnIds =
        card.columnId === columnId ? [columnId] : [card.columnId, columnId];

      await optimistic({
        failureMessage: "Couldn't move the card.",
        change: (data) => ({ ...data, cards: moveCardLocally(data.cards, id, columnId, index) }),
        send: () => api.moveCard(boardId, id, { columnId, position: index }),
        onSuccess: ({ cards }) => {
          set((state) => ({ cards: replaceCardsInColumns(state.cards, affectedColumnIds, cards) }));
        },
      });
    },

    applyEvent: (event) => {
      switch (event.type) {
        case "column:created":
        case "column:updated":
          set((state) => ({ columns: upsertById(state.columns, event.column) }));
          break;

        case "column:deleted":
          set((state) => ({
            columns: state.columns.filter((column) => column.id !== event.id),
            cards: state.cards.filter((card) => card.columnId !== event.id),
          }));
          break;

        case "card:created":
        case "card:updated":
          set((state) => ({ cards: upsertById(state.cards, event.card) }));
          break;

        case "card:deleted":
          set((state) => ({ cards: state.cards.filter((card) => card.id !== event.id) }));
          break;

        case "cards:reordered":
          set((state) => ({
            cards: replaceCardsInColumns(state.cards, event.columnIds, event.cards),
          }));
          break;
      }
    },
  };
});
