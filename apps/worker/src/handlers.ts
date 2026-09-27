import type { OutboxHandlers } from "@my-games/core/outbox";
import { socialHandlers } from "@my-games/core/social/handlers";
import type { PgBoss } from "pg-boss";
import { enqueueSteamSync } from "./jobs";

/**
 * Outbox olaylarının tüketicileri. Veritabanı yan etkileri (akış, bildirim kayıtları) olayın
 * transaction'ında yapılır; ağ gerektiren işler (Steam, IGDB, push) pg-boss kuyruğuna bırakılır.
 */
export function createHandlers(boss: PgBoss): OutboxHandlers {
  return {
    ...socialHandlers,
    "notification.push": async ({ notificationId }) => {
      await boss.send("push.send", { notificationId });
    },
    "steam.sync_requested": async ({ userId }) => {
      await enqueueSteamSync(boss, userId);
    },
    "igdb.match_requested": async () => {
      await boss.send("catalog.match-unlinked", {}, { singletonKey: "match-unlinked" });
    },
    "storage.objects_orphaned": async ({ keys }) => {
      await boss.send("storage.delete", { keys });
    },
  };
}
