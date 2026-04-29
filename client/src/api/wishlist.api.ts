import { apiFetch } from "./client";

export interface WishlistItem {
  _id: string;
  userId: string;
  igdbId: number;
  name: string;
  coverUrl?: string;
  platform: string;
  genres: string[];
  addedAt: string;
  source: "manual" | "steam";
  steamAppId?: number;
}

export const wishlistApi = {
  getAll: () => apiFetch<WishlistItem[]>("/api/wishlist"),
  add: (data: Partial<WishlistItem>) =>
    apiFetch<WishlistItem>("/api/wishlist", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiFetch(`/api/wishlist/${id}`, { method: "DELETE" }),
  clear: () =>
    apiFetch("/api/wishlist", { method: "DELETE" }),
  check: (igdbId: number) =>
    apiFetch<{ inWishlist: boolean; item?: WishlistItem }>(
      `/api/wishlist/check/${igdbId}`
    ),
  importFromSteam: (steamId: string) =>
    apiFetch<{ imported: number; failed: number; alreadyExists: number }>(
      "/api/wishlist/steam-import",
      { method: "POST", body: JSON.stringify({ steamId }) }
    ),
};