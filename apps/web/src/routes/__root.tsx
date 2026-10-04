import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { AddGameProvider } from "@/components/add-game";
import { AssistantPanelSlot } from "@/components/assistant/panel-slot";
import { AssistantProvider } from "@/components/assistant/provider";
import { NotFound } from "@/components/not-found";
import { OnboardingProvider } from "@/components/onboarding/provider";
import { SiteFooter } from "@/components/site-footer";
import { MobileTabBar, SiteHeader } from "@/components/site-header";
import { SpotlightProvider } from "@/components/spotlight";
import { Toaster } from "@/components/toaster";
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
      // Varsayılanlar; profil, oyun ve kayıt sayfaları kendi og:title/og:image'ını verir (alttaki route kazanır).
      { name: "description", content: m.home_subtitle() },
      { property: "og:site_name", content: m.app_name() },
      { property: "og:type", content: "website" },
      { property: "og:title", content: m.app_name() },
      { property: "og:description", content: m.home_subtitle() },
      { property: "og:locale", content: getLocale() === "tr" ? "tr_TR" : "en_US" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon-purple.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon-purple.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.webmanifest?v=purple" },
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
  // Yönetim bölümünün kendi kabuğu var (menü, başlık); sitenin başlığı, sekme çubuğu ve asistan paneli
  // orada gösterilmez. Erişim reddedildiyse (bulunamadı) normal site kabuğu kalır.
  const bare = useRouterState({
    select: (state) =>
      state.matches.find((match) => match.routeId === "/admin")?.status === "success",
  });
  return (
    <html lang={getLocale()} className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        <TooltipProvider>
          <AddGameProvider>
            <AssistantProvider>
              <SpotlightProvider>
                <OnboardingProvider>
                  {bare ? (
                    children
                  ) : (
                    <>
                      {/* Kabuk konumlanmış: sayfaların <Stage> katmanı buraya göre tam genişlikte yerleşir. Asistan
                      paneli geniş ekranda sabitlenince kabuk sağdan daralır (bkz. styles.css `.app-shell`). */}
                      <div className="app-shell relative isolate min-h-dvh overflow-x-clip transition-[padding] duration-300 ease-(--ease-salon)">
                        <SiteHeader />
                        <main className="mx-auto w-full max-w-7xl px-4 pt-2 pb-12 sm:px-6 md:pb-16 lg:px-8">
                          {children}
                        </main>
                        <SiteFooter />
                        <MobileTabBar />
                      </div>
                      <AssistantPanelSlot />
                    </>
                  )}
                </OnboardingProvider>
              </SpotlightProvider>
            </AssistantProvider>
          </AddGameProvider>
        </TooltipProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}
