import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { toast } from "sonner";
import { RouteError } from "./components/route-error";
import { ApiError } from "./lib/api";
import { errorMessage } from "./lib/errors";
import { routeTree } from "./routeTree.gen";

declare module "@tanstack/react-query" {
  interface Register {
    /** `errorToast: false`: hatayı çağıran kendisi gösteriyor (form içi uyarı vb.), genel bildirim çıkmasın. */
    mutationMeta: { errorToast?: boolean };
  }
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // 4xx (bulunamadı, yetki yok, geçersiz) tekrar denenince düzelmez; yalnızca bekletir. Ağ ve sunucu
        // hataları iki kez daha denenir.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
    // Kendi `onError`'u olmayan her işlem hatası kullanıcıya anlaşılır bir bildirimle döner; sessizce yutulmaz.
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.options.onError || mutation.meta?.errorToast === false) return;
        toast.error(errorMessage(error));
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient, user: null },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // Tarayıcı destekliyorsa sayfalar arası yumuşak geçiş; kapaklar `view-transition-name` ile yerinde uçar.
    // Yalnızca sayfa değişince: filtre/arama gibi yalnızca sorgu parametresi değişen gezinmelerde geçiş,
    // sayfayı her tuşta dondurup tıklamaları yutuyordu. (Geçiş türlerini desteklemeyen tarayıcılarda bu
    // ayrım yapılamaz; sık tetiklenen sorgu gezinmeleri ayrıca `viewTransition: false` ile çağrılır.)
    defaultViewTransition: { types: ({ pathChanged }) => (pathChanged ? ["page"] : false) },
    defaultErrorComponent: RouteError,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
