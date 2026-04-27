import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/api/users.api";
import { userKeys } from "@/api/queryKeys";

export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: usersApi.getAll,
    staleTime: 5 * 60_000,
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => usersApi.getById(id),
    enabled: !!id,
  });
}
