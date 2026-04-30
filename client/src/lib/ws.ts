import { useAuthStore } from "@/store/auth.store";

const WS_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:3030")
  .replace(/^http/, "ws");

export type WsEvent =
  | { type: "notification:new"; payload: import("@my-games/shared").Notification }
  | { type: "notification:count"; payload: { count: number } }
  | { type: "sync:complete"; payload: { synced: number; conflicts: number; errors: number } }
  | { type: "sync:progress"; payload: { synced: number; total: number } };

type WsListener = (event: WsEvent) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<WsListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private maxDelay = 30_000;
  private stopped = false;

  connect(): void {
    this.stopped = false;
    this._open();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, "logout");
    this.ws = null;
  }

  on(listener: WsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private _open(): void {
    const token = useAuthStore.getState().token;
    if (!token) return;

    this.ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);

    this.ws.onopen = () => {
      this.reconnectDelay = 2000; // başarılı bağlantıda sıfırla
    };

    this.ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as WsEvent;
        for (const fn of this.listeners) fn(data);
      } catch {
        // Geçersiz JSON — yoksay
      }
    };

    this.ws.onclose = (evt) => {
      if (this.stopped || evt.code === 4001) return; // unauthorized veya kasıtlı kapatma
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private _scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
      this._open();
    }, this.reconnectDelay);
  }
}

// Uygulama genelinde tek örnek
export const wsClient = new WsClient();
