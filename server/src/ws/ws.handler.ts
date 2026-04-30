import { createBunWebSocket } from "hono/bun";
import { verifyToken } from "../lib/jwt";
import { wsManager, type WsData } from "./ws.manager";
import type { WsClientEvent } from "./ws.events";

export const { upgradeWebSocket, websocket } = createBunWebSocket<WsData>();

export const wsRoute = upgradeWebSocket((c) => {
  // Token query param olarak gelir (WS header desteklemez tarayıcıda)
  const token = c.req.query("token");

  let userId: string;
  try {
    if (!token) throw new Error("No token");
    const payload = verifyToken(token);
    userId = payload.id;
  } catch {
    // Geçersiz token — bağlantıyı reddet
    return {
      onOpen(_evt, ws) {
        ws.close(4001, "Unauthorized");
      },
    };
  }

  return {
    onOpen(_evt, ws) {
      // Hono WS nesnesi .raw ile Bun ServerWebSocket'e erişir
      wsManager.add(userId, (ws as any).raw);
      console.log(`[WS] Connected: ${userId} (total: ${wsManager.connectedUserCount()})`);
    },

    onMessage(evt, _ws) {
      try {
        const msg = JSON.parse(evt.data as string) as WsClientEvent;
        if (msg.type === "ping") {
          // pong göndermiyoruz — Bun'ın built-in ping/pong mekanizması yeterli
        }
      } catch {
        // Geçersiz JSON — yoksay
      }
    },

    onClose(_evt, ws) {
      wsManager.remove(userId, (ws as any).raw);
      console.log(`[WS] Disconnected: ${userId} (total: ${wsManager.connectedUserCount()})`);
    },

    onError(err) {
      console.error(`[WS] Error for user ${userId}:`, err);
    },
  };
});
