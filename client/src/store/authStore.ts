import { create } from "zustand";
import * as api from "../lib/api";
import type { User } from "../types";

export type AuthStatus = "loading" | "ready";

interface AuthState {
  user: User | null;
  // Access token is held in-memory ONLY; never stored in localStorage, sessionStorage, or IndexedDB.
  // This mitigates token theft via Cross-Site Scripting (XSS).
  accessToken: string | null;
  status: AuthStatus;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setSession: (user: User, accessToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  accessToken: null,
  status: "loading",

  setSession: (user: User, accessToken: string) => {
    set({ user, accessToken, status: "ready" });
  },

  clearAuth: () => {
    set({ user: null, accessToken: null, status: "ready" });
  },

  login: async (email, password) => {
    const data = await api.login({ email, password });
    set({ user: data.user, accessToken: data.accessToken, status: "ready" });
  },

  register: async (email, password) => {
    const data = await api.register({ email, password });
    set({ user: data.user, accessToken: data.accessToken, status: "ready" });
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ user: null, accessToken: null, status: "ready" });
    }
  },

  logoutAll: async () => {
    try {
      await api.logoutAll();
    } finally {
      set({ user: null, accessToken: null, status: "ready" });
    }
  },

  restoreSession: async () => {
    if (get().user && get().accessToken) {
      set({ status: "ready" });
      return;
    }
    try {
      // POST /api/auth/refresh relies on the HttpOnly refresh token cookie sent automatically
      // by the browser with credentials: "include".
      const data = await api.refreshToken();
      set({ user: data.user, accessToken: data.accessToken, status: "ready" });
    } catch {
      // Unauthenticated or expired session — gracefully switch to ready state with no user
      set({ user: null, accessToken: null, status: "ready" });
    }
  },
}));
