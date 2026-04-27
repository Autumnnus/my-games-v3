import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as notificationApi from "@/api/notification.api";
import { notificationKeys } from "@/api/queryKeys";
import { useAuthStore } from "@/store/auth.store";

export function useUnreadCount() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: notificationApi.getUnreadCount,
    enabled: isAuthenticated(),
    refetchInterval: 30_000, // 30sn'de bir kontrol et
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export function useNotifications(page = 1) {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: notificationKeys.list(page),
    queryFn: () => notificationApi.getNotifications(page),
    enabled: isAuthenticated(),
    staleTime: 15_000,
  });
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
