import { create } from "zustand";
import * as api from "../lib/api";
import type { BoardSummary } from "../types";
import { useToastStore } from "./toastStore";

type LoadStatus = "loading" | "ready" | "error";

interface BoardsState {
  boards: BoardSummary[];
  status: LoadStatus;
  errorMessage: string | null;

  loadBoards: () => Promise<void>;
  createBoard: (title: string) => Promise<BoardSummary>;
  renameBoard: (id: string, title: string) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export const useBoardsStore = create<BoardsState>()((set, get) => ({
  boards: [],
  status: "loading",
  errorMessage: null,

  loadBoards: async () => {
    set({ status: "loading", errorMessage: null });
    try {
      const boards = await api.fetchBoards();
      set({ boards, status: "ready", errorMessage: null });
    } catch (error) {
      set({ status: "error", errorMessage: errorText(error) });
    }
  },

  createBoard: async (title: string) => {
    try {
      const created = await api.createBoard(title);
      set((state) => ({ boards: [created, ...state.boards] }));
      return created;
    } catch (error) {
      const message = `Couldn't create board. ${errorText(error)}`;
      useToastStore.getState().push(message);
      throw error;
    }
  },

  renameBoard: async (id: string, title: string) => {
    const previous = get().boards;
    // Optimistic rename
    set((state) => ({
      boards: state.boards.map((b) => (b.id === id ? { ...b, title } : b)),
    }));

    try {
      const updated = await api.renameBoard(id, title);
      set((state) => ({
        boards: state.boards.map((b) => (b.id === id ? updated : b)),
      }));
    } catch (error) {
      set({ boards: previous });
      useToastStore.getState().push(`Couldn't rename board. ${errorText(error)}`);
      throw error;
    }
  },

  deleteBoard: async (id: string) => {
    const previous = get().boards;
    set((state) => ({
      boards: state.boards.filter((b) => b.id !== id),
    }));

    try {
      await api.deleteBoard(id);
    } catch (error) {
      set({ boards: previous });
      useToastStore.getState().push(`Couldn't delete board. ${errorText(error)}`);
      throw error;
    }
  },
}));
