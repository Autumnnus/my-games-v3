import { app as api, syncLocale } from "@my-games/api";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { getServerAsyncLocalStorage } from "./paraglide/runtime.js";
import { paraglideMiddleware } from "./paraglide/server.js";

// /api/* doğrudan Hono'ya gider; geri kalan her şey SSR. Tek process, tek port.
export default createServerEntry({
  async fetch(request) {
    if (new URL(request.url).pathname.startsWith("/api/")) return api.fetch(request);
    // Oturum açıksa arayüz dili hesabın diline eşitlenir (başka cihazda değiştirildiyse ya da giriş ekranında
    // seçildiyse); SSR ilk karede doğru dilde çizer, çerez de yanıtla güncellenir.
    const { locale, setCookies } = await syncLocale(request);
    const response = await paraglideMiddleware(request, () => {
      if (!locale) return handler.fetch(request);
      // Paraglide dili istekteki (eski) çerezden seçti; bu istek için hesabın diliyle değiştirilir.
      const storage = getServerAsyncLocalStorage();
      const store = storage?.getStore();
      return storage && store
        ? storage.run({ ...store, locale }, () => handler.fetch(request))
        : handler.fetch(request);
    });
    if (setCookies.length === 0) return response;
    const headers = new Headers(response.headers);
    for (const cookie of setCookies) headers.append("set-cookie", cookie);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
});
