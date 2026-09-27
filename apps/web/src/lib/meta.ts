import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

export const metaQuery = queryOptions({
  queryKey: ["meta"],
  queryFn: async () => {
    const response = await api.meta.$get();
    if (!response.ok) throw new Error(`meta: ${response.status}`);
    return response.json();
  },
  staleTime: Number.POSITIVE_INFINITY,
});
