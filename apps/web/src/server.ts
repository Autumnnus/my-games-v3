import { app as api } from "@my-games/api";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "./paraglide/server.js";

// /api/* doğrudan Hono'ya gider; geri kalan her şey SSR. Tek process, tek port.
export default createServerEntry({
  fetch(request) {
    if (new URL(request.url).pathname.startsWith("/api/")) return api.fetch(request);
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
});
