import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import * as notificationApi from "@/api/notification.api";
import { notificationKeys } from "@/api/queryKeys";
import { useAuthStore } from "@/store/auth.store";
import { useWsEvent } from "@/hooks/useWebSocket";
import type { Notification } from "@my-games/shared";

export function useUnreadCount() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  // Polling yok — WS push ile güncelleniyor
  const query = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: notificationApi.getUnreadCount,
    enabled: isAuthenticated(),
    staleTime: Infinity, // WS güncelleyene kadar bayatlamaz
    refetchOnWindowFocus: false,
  });

  // WS: anlık count push'u
  const onCount = useCallback(
    (e: { type: "notification:count"; payload: { count: number } }) => {
      qc.setQueryData(notificationKeys.unreadCount(), { count: e.payload.count });
    },
    [qc],
  );
  useWsEvent("notification:count", onCount);

  return query;
}

export function useNotifications(page = 1) {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: notificationKeys.list(page),
    queryFn: () => notificationApi.getNotifications(page),
    enabled: isAuthenticated(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // WS: yeni bildirim gelince listeye prepend et
  const onNew = useCallback(
    (e: { type: "notification:new"; payload: Notification }) => {
      qc.setQueryData(
        notificationKeys.list(1),
        (old: ReturnType<typeof notificationApi.getNotifications> extends Promise<infer T> ? T : never) => {
          if (!old) return old;
          const exists = old.items.some((n) => n._id === e.payload._id);
          if (exists) return old;
          return {
            ...old,
            items: [e.payload, ...old.items],
            total: old.total + 1,
            unreadCount: old.unreadCount + 1,
          };
        },
      );
    },
    [qc],
  );
  useWsEvent("notification:new", onNew);

  return query;
}

export function useMarkAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.markAsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.markAllAsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
