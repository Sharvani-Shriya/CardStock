import { create } from "zustand";

interface Toast {
  id: number;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string) => void;
  dismiss: (id: number) => void;
}

let nextToastId = 1;

// Auto-dismissing lives in Toasts.tsx, not here, so the timer can pause while
// the user hovers over or focuses a toast and has time to read it.
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  push: (message) => {
    const id = nextToastId++;
    set((state) => ({ toasts: [...state.toasts, { id, message }] }));
  },

  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));
