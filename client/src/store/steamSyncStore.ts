import { create } from "zustand";

interface SteamSyncState {
  conflictPopupOpen: boolean;
  setConflictPopupOpen: (open: boolean) => void;
  dismissedAt: string | null;
  setDismissedAt: (ts: string) => void;
}

export const useSteamSyncStore = create<SteamSyncState>()((set) => ({
  conflictPopupOpen: false,
  setConflictPopupOpen: (open) => set({ conflictPopupOpen: open }),
  dismissedAt: null,
  setDismissedAt: (ts) => set({ dismissedAt: ts }),
}));
