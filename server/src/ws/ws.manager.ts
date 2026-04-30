import type { ServerWebSocket } from "bun";
import type { WsServerEvent } from "./ws.events";

export interface WsData {
  userId: string;
}

// userId → açık bağlantı seti (aynı kullanıcı birden fazla sekme açabilir)
const connections = new Map<string, Set<ServerWebSocket<WsData>>>();

function add(userId: string, ws: ServerWebSocket<WsData>): void {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId)!.add(ws);
}

function remove(userId: string, ws: ServerWebSocket<WsData>): void {
  const sockets = connections.get(userId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) connections.delete(userId);
}

function send(userId: string, event: WsServerEvent): void {
  const sockets = connections.get(userId);
  if (!sockets?.size) return;
  const msg = JSON.stringify(event);
  for (const ws of sockets) {
    try {
      ws.send(msg);
    } catch {
      // Bağlantı kapanmış olabilir — temizle
      sockets.delete(ws);
    }
  }
}

function broadcast(userIds: string[], event: WsServerEvent): void {
  for (const uid of userIds) send(uid, event);
}

function connectedUserCount(): number {
  return connections.size;
}

export const wsManager = { add, remove, send, broadcast, connectedUserCount };
