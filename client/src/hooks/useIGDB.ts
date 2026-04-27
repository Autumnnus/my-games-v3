import { useQuery } from "@tanstack/react-query";
import { igdbApi } from "@/api/igdb.api";
import { igdbKeys } from "@/api/queryKeys";

export function useIGDBSearch(query: string) {
  return useQuery({
    queryKey: igdbKeys.search(query),
    queryFn: () => igdbApi.search(query),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useIGDBGame(id: number) {
  return useQuery({
    queryKey: igdbKeys.detail(id),
    queryFn: () => igdbApi.getById(id),
    enabled: !!id,
    staleTime: 10 * 60_000,
  });
}
