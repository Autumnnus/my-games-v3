import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { Toaster } from "sonner";
import { AddGameProvider } from "@/components/add-game";
import { NotFound } from "@/components/not-found";
import { MobileTabBar, SiteHeader } from "@/components/site-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { metaQuery } from "@/lib/meta";
import { proposalCountQuery, unreadQuery } from "@/lib/queries";
import { type CurrentUser, sessionQuery } from "@/lib/session";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import appCss from "../styles.css?url";

export type RouterContext = {
  queryClient: QueryClient;
  user: CurrentUser | null;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => {
    // Önbellekteki oturum bayatsa sayfayı bekletmeden arka planda tazelenir.
    const user = await context.queryClient.ensureQueryData({
      ...sessionQuery,
      revalidateIfStale: true,
    });
    return { user };
  },
  // Header sayaçları ilk SSR'da dolu gelsin (sonrası SSE ve React Query ile güncellenir).
  loader: async ({ context }) => {
    // Açık entegrasyonlar (Steam/PSN/Xbox, yükleme…) SSR'da da bilinsin; yoksa kartlar hydration'da değişir.
    const meta = context.queryClient.prefetchQuery(metaQuery);
    if (!context.user) return meta;
    await Promise.all([
      meta,
      context.queryClient.prefetchQuery(proposalCountQuery),
      context.queryClient.prefetchQuery(unreadQuery),
    ]);
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0b0c10" },
      { title: m.app_name() },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <html lang={getLocale()} className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        <TooltipProvider>
          <AddGameProvider>
            {/* Kabuk konumlanmış: sayfaların <Stage> katmanı buraya göre tam genişlikte yerleşir. */}
            <div className="relative isolate min-h-dvh overflow-x-clip">
              <SiteHeader />
              <main className="mx-auto w-full max-w-7xl px-4 pt-2 pb-32 sm:px-6 md:pb-16 lg:px-8">
                {children}
              </main>
              <MobileTabBar />
            </div>
          </AddGameProvider>
        </TooltipProvider>
        <Toaster theme="dark" richColors position="top-center" />
        <Scripts />
      </body>
    </html>
  );
}
