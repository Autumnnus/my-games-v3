import { create } from "zustand";

type ViewMode = "grid" | "list";

interface UIState {
  gamesViewMode: ViewMode;
  setGamesViewMode: (mode: ViewMode) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  gamesViewMode: "grid",
  setGamesViewMode: (mode) => set({ gamesViewMode: mode }),
  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}));
