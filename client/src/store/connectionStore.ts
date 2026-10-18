import { create } from "zustand";

// "connecting" only exists before the very first successful connection;
// afterwards the socket flips between "connected" and "reconnecting".
export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

interface ConnectionState {
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
}

// Kept apart from the board store because it changes for a different reason
// (network health, not board data) and only the status badge reads it.
export const useConnectionStore = create<ConnectionState>()((set) => ({
  status: "connecting",
  setStatus: (status) => set({ status }),
}));
