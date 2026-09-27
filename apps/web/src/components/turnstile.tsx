import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { metaQuery } from "@/lib/meta";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Cloudflare Turnstile bileşeni. Site anahtarı yoksa hiçbir şey çizmez (özellik kapalı).
 * Doğrulama tokenı `onToken` ile verilir; Better Auth istekleri `x-captcha-response` header'ıyla gönderir.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const { data } = useQuery(metaQuery);
  const siteKey = data?.features.turnstileSiteKey;
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let widgetId: string | undefined;
    const render = () => {
      if (!window.turnstile || !container.current) return;
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
      });
    };
    if (window.turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render, { once: true });
    }
    return () => {
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={container} />;
}

/** Turnstile açıksa token zorunludur. */
export function useTurnstileRequired() {
  const { data } = useQuery(metaQuery);
  return !!data?.features.turnstileSiteKey;
}
