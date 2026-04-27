import type { NotificationListResponse } from "@my-games/shared";
import { apiFetch } from "./client";

export function getNotifications(page = 1): Promise<NotificationListResponse> {
  return apiFetch("/api/notifications", { params: { page, limit: 20 } });
}

export function getUnreadCount(): Promise<{ count: number }> {
  return apiFetch("/api/notifications/unread-count");
}

export function markAsRead(id: string): Promise<void> {
  return apiFetch(`/api/notifications/${id}/read`, { method: "PUT" });
}

export function markAllAsRead(): Promise<void> {
  return apiFetch("/api/notifications/read-all", { method: "PUT" });
}
