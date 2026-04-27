import { apiFetch } from "./client";
import type { UserProfile } from "./types";

export const usersApi = {
  getAll: () => apiFetch<UserProfile[]>("/api/users"),

  getById: (id: string) => apiFetch<UserProfile>(`/api/users/${id}`),

  deleteUser: (id: string) =>
    apiFetch<void>(`/api/users/deleteUser/${id}`, { method: "DELETE" }),
};
