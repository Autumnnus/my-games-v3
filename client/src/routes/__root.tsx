import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import { AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/auth.store";
import { Navbar } from "@/components/layout/Navbar";

interface RouterContext {
  auth: ReturnType<typeof useAuthStore.getState>;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
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
            background: "rgba(15, 15, 26, 0.95)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(20px)",
            color: "rgba(255,255,255,0.95)",
          },
        }}
      />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </div>
  );
}
