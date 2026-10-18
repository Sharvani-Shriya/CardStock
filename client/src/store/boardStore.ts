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
  status: LoadStatus;
  errorMessage: string | null;

  loadBoard: (options?: { quiet?: boolean }) => Promise<void>;
  addColumn: (title: string) => Promise<void>;
  renameColumn: (id: string, title: string) => Promise<void>;
  deleteColumn: (id: string) => Promise<void>;
  addCard: (columnId: string, title: string, description: string) => Promise<void>;
  editCard: (id: string, changes: { title: string; description: string }) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  moveCard: (id: string, columnId: string, index: number) => Promise<void>;
  applyEvent: (event: ServerEvent) => void;
}

// Module-level bookkeeping for the sync logic below. These are not React state
// because nothing on screen depends on them.
let latestLoadId = 0; // lets us ignore a board response that a newer request has overtaken
let pendingMutations = 0; // optimistic changes still waiting for the server
let resyncAfterMutations = false; // a refetch was held back and must run when we are idle

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export const useBoardStore = create<BoardState>()((set, get) => {
  // The one place that implements "optimistic update with rollback":
  // 1. remember the current data, 2. show the change immediately,
  // 3. ask the server, 4. on failure put the old data back and tell the user.
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
      // Restoring the snapshot would also undo any other change made while this
      // request was in flight, so we schedule a quiet refetch (below) to bring
      // the screen back in line with the server.
      set(previous);
      resyncAfterMutations = true;
      useToastStore.getState().push(`${options.failureMessage} ${errorText(error)}`);
    } finally {
      pendingMutations -= 1;
      if (pendingMutations === 0 && resyncAfterMutations) {
        resyncAfterMutations = false;
        void get().loadBoard({ quiet: true });
      }
    }
  }

  return {
    columns: [],
    cards: [],
    status: "loading",
    errorMessage: null,

    loadBoard: async ({ quiet = false } = {}) => {
      const requestId = ++latestLoadId;
      if (!quiet) set({ status: "loading", errorMessage: null });

      try {
        const board = await api.fetchBoard();
        if (requestId !== latestLoadId) return;

        // Applying a snapshot taken before our pending changes reached the
        // server would make them flicker back to their old state. Hold it
        // back; optimistic() refetches as soon as everything has settled.
        if (pendingMutations > 0) {
          resyncAfterMutations = true;
          return;
        }

        set({ columns: board.columns, cards: board.cards, status: "ready", errorMessage: null });
      } catch (error) {
        if (requestId !== latestLoadId) return;
        // A quiet refetch fails silently (the socket keeps retrying), unless
        // there is nothing on screen yet and the user is waiting on it.
        if (!quiet || get().status === "loading") {
          set({ status: "error", errorMessage: errorText(error) });
        }
      }
    },

    addColumn: async (title) => {
      const tempId = makeTempId();
      const position = nextPosition(get().columns);

      await optimistic({
        failureMessage: "Couldn't add the column.",
        change: (data) => ({
          ...data,
          columns: [...data.columns, { id: tempId, title, position }],
        }),
        send: () => api.createColumn(title),
        // Swap the temporary id for the server's id once we have it.
        onSuccess: (created) => {
          set((state) => ({ columns: swapById(state.columns, tempId, created) }));
        },
      });
    },

    renameColumn: async (id, title) => {
      if (isTempId(id)) return;

      await optimistic({
        failureMessage: "Couldn't rename the column.",
        change: (data) => ({
          ...data,
          columns: data.columns.map((column) => (column.id === id ? { ...column, title } : column)),
        }),
        send: () => api.updateColumn(id, { title }),
      });
    },

    deleteColumn: async (id) => {
      if (isTempId(id)) return;

      await optimistic({
        failureMessage: "Couldn't delete the column.",
        // The server deletes the column's cards too, so mirror that here.
        change: (data) => ({
          columns: data.columns.filter((column) => column.id !== id),
          cards: data.cards.filter((card) => card.columnId !== id),
        }),
        send: () => api.deleteColumn(id),
      });
    },

    addCard: async (columnId, title, description) => {
      // A card cannot be saved into a column the server has not created yet.
      if (isTempId(columnId)) return;

      const tempId = makeTempId();
      const position = nextPosition(get().cards.filter((card) => card.columnId === columnId));

      await optimistic({
        failureMessage: "Couldn't add the card.",
        change: (data) => ({
          ...data,
          cards: [...data.cards, { id: tempId, columnId, title, description, position }],
        }),
        send: () => api.createCard({ columnId, title, description }),
        onSuccess: (created) => {
          set((state) => ({ cards: swapById(state.cards, tempId, created) }));
        },
      });
    },

    editCard: async (id, changes) => {
      if (isTempId(id)) return;

      await optimistic({
        failureMessage: "Couldn't save the card.",
        change: (data) => ({
          ...data,
          cards: data.cards.map((card) => (card.id === id ? { ...card, ...changes } : card)),
        }),
        send: () => api.updateCard(id, changes),
      });
    },

    deleteCard: async (id) => {
      if (isTempId(id)) return;

      await optimistic({
        failureMessage: "Couldn't delete the card.",
        change: (data) => ({ ...data, cards: data.cards.filter((card) => card.id !== id) }),
        send: () => api.deleteCard(id),
      });
    },

    moveCard: async (id, columnId, index) => {
      const card = get().cards.find((item) => item.id === id);
      if (!card || isTempId(id)) return;

      if (isTempId(columnId)) {
        useToastStore.getState().push("That column is still being created. Try again in a moment.");
        return;
      }

      const affectedColumnIds =
        card.columnId === columnId ? [columnId] : [card.columnId, columnId];

      await optimistic({
        failureMessage: "Couldn't move the card.",
        change: (data) => ({ ...data, cards: moveCardLocally(data.cards, id, columnId, index) }),
        send: () => api.moveCard(id, { columnId, position: index }),
        // The server's answer is the source of truth for the affected columns.
        onSuccess: ({ cards }) => {
          set((state) => ({ cards: replaceCardsInColumns(state.cards, affectedColumnIds, cards) }));
        },
      });
    },

    // Applies an event broadcast by the server (a change made by someone else).
    // The sender never receives its own events, so there is no double-apply.
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
