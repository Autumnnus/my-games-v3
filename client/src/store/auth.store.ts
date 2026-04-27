import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthTokenResponse } from "@my-games/shared";

type AuthUser = AuthTokenResponse["user"];

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  updateUser: (user: Partial<AuthUser>) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      updateUser: (partial) => {
        const current = get().user;
        if (current) set({ user: { ...current, ...partial } });
      },
      clearAuth: () => set({ token: null, user: null }),
      isAuthenticated: () => !!get().token && !!get().user,
    }),
    {
      name: "my-games-auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
