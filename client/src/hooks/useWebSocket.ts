import { useEffect } from "react";
import { wsClient, type WsEvent } from "@/lib/ws";
import { useAuthStore } from "@/store/auth.store";

/**
 * Uygulama mount olduğunda WS bağlantısını yönetir.
 * Auth durumuna göre bağlan / kes.
 */
export function useWsConnection(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  useEffect(() => {
    if (isAuthenticated) {
      wsClient.connect();
    } else {
      wsClient.disconnect();
    }
    return () => {
      wsClient.disconnect();
    };
  }, [isAuthenticated]);
}

/**
 * Belirli bir WS event tipini dinler.
 * @example
 * useWsEvent("notification:new", (e) => console.log(e.payload));
 */
export function useWsEvent<T extends WsEvent["type"]>(
  type: T,
  handler: (event: Extract<WsEvent, { type: T }>) => void,
): void {
  useEffect(() => {
    return wsClient.on((event) => {
      if (event.type === type) {
        handler(event as Extract<WsEvent, { type: T }>);
      }
    });
  }, [type, handler]);
}
