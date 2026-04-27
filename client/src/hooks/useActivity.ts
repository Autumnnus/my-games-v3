import { useQuery } from "@tanstack/react-query";
import { getActivityFeed, getUserActivity } from "@/api/activity.api";
import { activityKeys } from "@/api/queryKeys";

export function useActivityFeed(page = 1) {
  return useQuery({
    queryKey: activityKeys.feed(page),
    queryFn: () => getActivityFeed(page),
    staleTime: 30_000,
  });
}

export function useUserActivity(userId: string, page = 1) {
  return useQuery({
    queryKey: activityKeys.user(userId, page),
    queryFn: () => getUserActivity(userId, page),
    enabled: !!userId,
    staleTime: 30_000,
  });
}
