import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { Screenshot, ScreenshotListResponse } from "./types";

export const screenshotsApi = {
  getGameScreenshots: (gameId: string, page = 1, limit = 20) =>
    apiFetch<ScreenshotListResponse>(`/api/screenshot/${gameId}`, {
      params: { page, limit },
    }),

  getRandom: (count: number) =>
    apiFetch<Screenshot[]>(`/api/screenshot/get/random/${count}`),

  addImageScreenshot: (gameId: string, formData: FormData) =>
    apiFetch<Screenshot[]>(`/api/screenshot/add/${gameId}`, {
      method: "POST",
      body: formData,
    }),

  addTextScreenshot: (
    gameId: string,
    payload: Array<{ url: string; name?: string }>,
  ) =>
    apiFetch<Screenshot[]>(`/api/screenshot/add/${gameId}`, {
      method: "POST",
      body: JSON.stringify({ type: "text", payload }),
    }),

  importExternalScreenshots: (
    gameId: string,
    payload: Array<{ url: string; thumbnail?: string; name?: string }>,
  ) =>
    apiFetch<Screenshot[]>(`/api/screenshot/add/${gameId}`, {
      method: "POST",
      body: JSON.stringify({ type: "external", payload }),
    }),

  deleteScreenshot: (gameId: string) =>
    apiFetch<void>(`/api/screenshot/delete/${gameId}`, {
      method: "DELETE",
    }),

  editScreenshot: (
    gameId: string,
    screenshotId: string,
    data: { name?: string },
  ) =>
    apiFetch<Screenshot>(`/api/screenshot/edit/${gameId}/${screenshotId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteAllForGame: (gameId: string) =>
    apiFetch<void>(`/api/screenshot/delete-all/${gameId}`, {
      method: "DELETE",
    }),

  getUserScreenshots: (userId: string) =>
    apiFetch<Screenshot[]>(`/api/screenshot/user/${userId}`),

  deleteMultipleScreenshots: (gameId: string, screenshotIds: string[]) =>
    apiFetch<void>(`/api/screenshot/delete/${gameId}`, {
      method: "DELETE",
      body: JSON.stringify({ screenshotIds }),
    }),
};

export function useDeleteMultipleScreenshots(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (screenshotIds: string[]) =>
      screenshotsApi.deleteMultipleScreenshots(gameId, screenshotIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenshotKeys.game(gameId) });
    },
  });
}
