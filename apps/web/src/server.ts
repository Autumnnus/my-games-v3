import { app as api, syncLocale } from "@my-games/api";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { getServerAsyncLocalStorage } from "./paraglide/runtime.js";
import { paraglideMiddleware } from "./paraglide/server.js";

/**
 * SSR sayfalarının güvenlik başlıkları (`/api/*` Hono'nun `secureHeaders`'ını alır). CSP şimdilik yalnızca
 * çerçeveleme, `<base>` ve eklentileri kapatır: hydration betikleri satır içi, görseller birçok CDN'den
 * (IGDB, Steam, PSN, Xbox, R2) geldiği için `script-src`/`img-src` nonce'lu ayrı bir çalışma ister.
 */
const pageSecurityHeaders: Record<string, string> = {
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  ...(process.env.APP_URL?.startsWith("https://")
    ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
    : {}),
};

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
    const headers = new Headers(response.headers);
    for (const cookie of setCookies) headers.append("set-cookie", cookie);
    for (const [name, value] of Object.entries(pageSecurityHeaders)) {
      if (!headers.has(name)) headers.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
});
