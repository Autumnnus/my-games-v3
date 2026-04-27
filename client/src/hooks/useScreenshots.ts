import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { screenshotsApi } from "@/api/screenshots.api";
import { screenshotKeys } from "@/api/queryKeys";
import { isApiError } from "@/api/client";

export function useGameScreenshots(gameId: string, page = 1) {
  return useQuery({
    queryKey: screenshotKeys.game(gameId, page),
    queryFn: () => screenshotsApi.getGameScreenshots(gameId, page),
    enabled: !!gameId,
  });
}

export function useRandomScreenshots(count: number) {
  return useQuery({
    queryKey: screenshotKeys.random(count),
    queryFn: () => screenshotsApi.getRandom(count),
    staleTime: 5 * 60_000,
  });
}

export function useAddImageScreenshot(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      screenshotsApi.addImageScreenshot(gameId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenshotKeys.game(gameId) });
      toast.success("Ekran görüntüsü eklendi");
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.message : "Ekran görüntüsü eklenemedi");
    },
  });
}

export function useAddTextScreenshot(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Array<{ url: string; name?: string }>) =>
      screenshotsApi.addTextScreenshot(gameId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenshotKeys.game(gameId) });
      toast.success("Ekran görüntüsü eklendi");
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.message : "Ekleme başarısız");
    },
  });
}

export function useImportSteamScreenshots(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      payload: Array<{ url: string; thumbnail?: string; name?: string }>,
    ) => screenshotsApi.importExternalScreenshots(gameId, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenshotKeys.game(gameId) });
      toast.success(`${data.length} ekran görüntüsü eklendi`);
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.message : "Import başarısız");
    },
  });
}

export function useDeleteScreenshot(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (screenshotGameId: string) =>
      screenshotsApi.deleteScreenshot(screenshotGameId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenshotKeys.game(gameId) });
      toast.success("Ekran görüntüsü silindi");
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.message : "Silme başarısız");
    },
  });
}

export function useDeleteAllScreenshots(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => screenshotsApi.deleteAllForGame(gameId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenshotKeys.game(gameId) });
      toast.success("Tüm ekran görüntüleri silindi");
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.message : "Silme başarısız");
    },
  });
}

export function useUserScreenshots(userId: string) {
  return useQuery({
    queryKey: screenshotKeys.user(userId),
    queryFn: () => screenshotsApi.getUserScreenshots(userId),
    enabled: !!userId,
  });
}
