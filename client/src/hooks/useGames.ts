import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { gamesApi, type AddGameInput } from "@/api/games.api";
import { gameKeys } from "@/api/queryKeys";
import { useAuthStore } from "@/store/auth.store";
import { isApiError } from "@/api/client";
import type { GameStatus, Platform } from "@my-games/shared";

export interface GameFilters {
  status?: GameStatus;
  platform?: Platform;
  sortBy?: string;
  order?: "asc" | "desc";
  search?: string;
}

export function useUserGames(filters: GameFilters = {}) {
  const userId = useAuthStore((s) => s.user?._id ?? "");
  return useInfiniteQuery({
    queryKey: gameKeys.user(userId, filters),
    queryFn: ({ pageParam }) =>
      gamesApi.getUserGames({
        userId,
        page: pageParam as number,
        limit: 24,
        ...filters,
      }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => {
      if (!last || pages.length >= last.totalPages) return undefined;
      return pages.length + 1;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useGame(gameId: string) {
  return useQuery({
    queryKey: gameKeys.detail(gameId),
    queryFn: () => gamesApi.getGame(gameId),
    enabled: !!gameId,
  });
}

export function useAddGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddGameInput) => gamesApi.addGame(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all });
      toast.success("Oyun kütüphaneye eklendi");
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.message : "Oyun eklenemedi");
    },
  });
}

export function useEditGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AddGameInput> }) =>
      gamesApi.editGame(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all });
      queryClient.setQueryData(gameKeys.detail(updated._id), updated);
      toast.success("Oyun güncellendi");
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.message : "Oyun güncellenemedi");
    },
  });
}

export function useUserGamesById(userId: string, filters: GameFilters = {}) {
  return useInfiniteQuery({
    queryKey: gameKeys.user(userId, filters),
    queryFn: ({ pageParam }) =>
      gamesApi.getUserGames({
        userId,
        page: pageParam as number,
        limit: 24,
        ...filters,
      }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => {
      if (!last || pages.length >= last.totalPages) return undefined;
      return pages.length + 1;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useDeleteGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => gamesApi.deleteGame(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all });
      queryClient.removeQueries({
        queryKey: gameKeys.detail(deletedId),
        exact: true,
      });
      toast.success("Oyun kütüphaneden kaldırıldı");
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.message : "Oyun silinemedi");
    },
  });
}
