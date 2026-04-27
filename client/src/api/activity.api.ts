import type { ActivityFeedResponse } from "@my-games/shared";
import { apiFetch } from "./client";

export function getActivityFeed(page = 1): Promise<ActivityFeedResponse> {
  return apiFetch("/api/activity/feed", { params: { page, limit: 20 } });
}

export function getUserActivity(
  userId: string,
  page = 1,
): Promise<ActivityFeedResponse> {
  return apiFetch(`/api/activity/user/${userId}`, {
    params: { page, limit: 20 },
  });
}
