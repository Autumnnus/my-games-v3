import type { Notification } from "@my-games/shared";

// ─── Server → Client ──────────────────────────────────────────────────────────

export interface NotificationNewEvent {
  type: "notification:new";
  payload: Notification;
}

export interface NotificationCountEvent {
  type: "notification:count";
  payload: { count: number };
}

export interface SyncCompleteEvent {
  type: "sync:complete";
  payload: { synced: number; conflicts: number; errors: number };
}

export interface SyncProgressEvent {
  type: "sync:progress";
  payload: { synced: number; total: number };
}

export type WsServerEvent =
  | NotificationNewEvent
  | NotificationCountEvent
  | SyncCompleteEvent
  | SyncProgressEvent;

// ─── Client → Server ──────────────────────────────────────────────────────────

export interface PingEvent {
  type: "ping";
}

export type WsClientEvent = PingEvent;
