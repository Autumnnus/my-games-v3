import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { api } from "./api";

async function fetchSession() {
  const response = await api.me.$get();
  if (!response.ok) throw new Error(`session: ${response.status}`);
  const { user } = await response.json();
  return user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof fetchSession>>>;

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: fetchSession,
  staleTime: 60_000,
});

/** Giriş/çıkıştan sonra oturumu ve route context'ini tazeler. */
export function useRefreshSession() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    // SSR'dan hydrate edilen sorgunun client'ta queryFn'i olmaz; `invalidateQueries` bu yüzden
    // yeniden çekemez. `fetchQuery` sorgu tanımını da verdiği için her durumda taze veri getirir.
    const user = await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
    await router.invalidate();
    return user;
  };
}

/** Sadece uygulama içi yollara yönlendir (open redirect'e karşı). */
export function safeRedirect(target: string | undefined) {
  return target?.startsWith("/") && !target.startsWith("//") ? target : "/";
}
