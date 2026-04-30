import {
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/auth.store";
import { Navbar } from "@/components/layout/Navbar";
import { setRouteThemeSeed } from "@/components/theme/ThemeProvider";
import { useWsConnection } from "@/hooks/useWebSocket";

interface RouterContext {
  auth: ReturnType<typeof useAuthStore.getState>;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useWsConnection();

  useEffect(() => {
    setRouteThemeSeed(pathname);
  }, [pathname]);

  return (
    <div className="gradient-mesh min-h-dvh">
      <Navbar />
      <AnimatePresence mode="wait">
        <Outlet />
      </AnimatePresence>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--theme-bg-overlay)",
            border: "1px solid var(--theme-glass-border)",
            backdropFilter: "blur(20px)",
            color: "var(--theme-text-primary)",
          },
        }}
      />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </div>
  );
}
