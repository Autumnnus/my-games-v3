import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./lib/queryClient";
import { useAuthStore } from "./store/auth.store";
import "./styles/globals.css";

// PWA service worker registration
import { registerSW } from "virtual:pwa-register";

registerSW({
  onNeedRefresh() {
    // Optionally prompt the user to refresh
    console.log("New content available, refresh to update.");
  },
  onOfflineReady() {
    console.log("App ready to work offline.");
  },
  onRegistered(registration) {
    console.log("Service worker registered:", registration?.scope);
  },
  onRegisterError(error) {
    console.error("Service worker registration error:", error);
  },
});

const router = createRouter({
  routeTree,
  context: {
    auth: useAuthStore.getState(),
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  const auth = useAuthStore();
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider
        router={router}
        context={{ auth: auth as ReturnType<typeof useAuthStore.getState> }}
      />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
