import { create } from "zustand";
import { persist } from "zustand/middleware";

type ViewMode = "grid" | "list";
export type ThemeMode = "dark" | "light" | "system";

interface UIState {
  gamesViewMode: ViewMode;
  setGamesViewMode: (mode: ViewMode) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  dynamicThemeEnabled: boolean;
  setDynamicThemeEnabled: (enabled: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      gamesViewMode: "grid",
      setGamesViewMode: (mode) => set({ gamesViewMode: mode }),
      mobileNavOpen: false,
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      themeMode: "dark",
      setThemeMode: (mode) => set({ themeMode: mode }),
      dynamicThemeEnabled: true,
      setDynamicThemeEnabled: (enabled) =>
        set({ dynamicThemeEnabled: enabled }),
    }),
    {
      name: "my-games-ui",
      partialize: (state) => ({
        gamesViewMode: state.gamesViewMode,
        themeMode: state.themeMode,
        dynamicThemeEnabled: state.dynamicThemeEnabled,
      }),
    },
  ),
);
