import { databaseConfig } from "@my-games/core/config";
import { NOTIFICATION_CHANNEL } from "@my-games/core/social/notifications";
import pg from "pg";

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();
let client: pg.Client | null = null;
let connecting: Promise<void> | null = null;

/**
 * Tek bir LISTEN bağlantısı ile bildirimleri açık SSE bağlantılarına dağıtır. Bağlantı ilk abone gelince
 * açılır; koparsa yeniden kurulur. Tek app instance'ı için tasarlandı.
 */
async function ensureConnected() {
  if (client || connecting) return connecting ?? undefined;
  connecting = (async () => {
    const next = new pg.Client({ connectionString: databaseConfig().url });
    next.on("notification", (message) => {
      if (!message.payload) return;
      for (const listener of listeners.get(message.payload) ?? []) listener();
    });
    next.on("error", (error) => {
      console.error("[realtime] LISTEN bağlantısı koptu", error.message);
      client = null;
      if (listeners.size > 0) setTimeout(() => void ensureConnected(), 3_000);
    });
    await next.connect();
    await next.query(`listen ${NOTIFICATION_CHANNEL}`);
    client = next;
  })().finally(() => {
    connecting = null;
  });
  return connecting;
}

export async function subscribe(userId: string, listener: Listener) {
  const set = listeners.get(userId) ?? new Set();
  set.add(listener);
  listeners.set(userId, set);
  await ensureConnected();
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(userId);
  };
}
