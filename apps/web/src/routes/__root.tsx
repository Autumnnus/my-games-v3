import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { Toaster } from "sonner";
import { AddGameProvider } from "@/components/add-game";
import { NotFound } from "@/components/not-found";
import { SiteHeader } from "@/components/site-header";
import { TooltipProvider } from "@/components/ui/tooltip";
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
    if (!context.user) return;
    await Promise.all([
      context.queryClient.prefetchQuery(proposalCountQuery),
      context.queryClient.prefetchQuery(unreadQuery),
    ]);
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0a0a0a" },
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
            <SiteHeader />
            <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
          </AddGameProvider>
        </TooltipProvider>
        <Toaster theme="dark" richColors position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
