import { refreshGameArt, refreshStaleGames, refreshSteamCovers } from "@my-games/core/catalog";
import { matchUnlinkedGames } from "@my-games/core/matching";
import { cleanupPendingAssets } from "@my-games/core/media";
import { pruneOutbox } from "@my-games/core/outbox";
import { platformAccountsDueForSync } from "@my-games/core/platforms/accounts";
import { syncPsnUser } from "@my-games/core/psn/sync";
import { sendPushForNotification } from "@my-games/core/social/push";
import { pollPresence } from "@my-games/core/steam/presence";
import { syncSteamUser, usersDueForSync } from "@my-games/core/steam/sync";
import { deleteObject } from "@my-games/core/storage";
import { syncXboxUser } from "@my-games/core/xbox/sync";
import type { PgBoss } from "pg-boss";

type JobDefinition = {
  name: string;
  /** Cron (UTC). Yoksa iş sadece `boss.send` ile tetiklenir. */
  cron?: string;
  run: (data: Record<string, unknown>) => Promise<unknown>;
  /** Aynı anda en fazla kaç iş (düşük tutulur; sunucu kaynağı sınırlı). */
  concurrency?: number;
  /** pg-boss kuyruk politikası (oluşturulduktan sonra değiştirilemez). */
  policy?: "standard" | "stately";
};

export const jobs: JobDefinition[] = [
  {
    name: "catalog.match-unlinked",
    // Saatte 25 oyun: IGDB ilk açıldığında eski kütüphane bir günde eşleşir, istek sınırı da aşılmaz.
    cron: "10 * * * *",
    run: () => matchUnlinkedGames(25),
  },
  {
    name: "catalog.steam-covers",
    cron: "20 4 * * *",
    run: () => refreshSteamCovers(),
  },
  {
    // Sahne görseli, logo ve kapak rengi. Yeni oyunlar en geç bir saat içinde dolar; eskiler ayda bir tazelenir.
    name: "catalog.game-art",
    cron: "40 * * * *",
    run: () => refreshGameArt(60),
  },
  {
    name: "catalog.refresh-metadata",
    cron: "0 5 * * 1",
    run: () => refreshStaleGames(50),
  },
  {
    // `stately` + singletonKey: aynı kullanıcı için en fazla bir aktif ve bir bekleyen iş. İki sync aynı
    // anda çalışıp aynı süre farkını iki kez oturum olarak yazamaz.
    name: "steam.sync-user",
    run: (data) => syncSteamUser(String(data.userId)),
    concurrency: 2,
    policy: "stately",
  },
  {
    name: "psn.sync-user",
    run: (data) => syncPsnUser(String(data.userId)),
    concurrency: 1,
    policy: "stately",
  },
  {
    name: "xbox.sync-user",
    run: (data) => syncXboxUser(String(data.userId)),
    concurrency: 1,
    policy: "stately",
  },
  {
    name: "push.send",
    run: (data) => sendPushForNotification(String(data.notificationId)),
    concurrency: 2,
  },
  {
    name: "steam.presence",
    cron: "*/2 * * * *",
    run: () => pollPresence(),
  },
  {
    name: "storage.delete",
    run: async (data) => {
      const keys = Array.isArray(data.keys) ? data.keys.map(String) : [];
      const targetId = typeof data.targetId === "string" ? data.targetId : null;
      // 404 başarı sayılır; hata olursa pg-boss yeniden dener.
      for (const key of keys) await deleteObject(key, targetId);
      return { deleted: keys.length };
    },
  },
  {
    // Tarayıcıda yarım kalan (onaylanmayan) yüklemeler: dosyalar silinir, ayrılan kota geri gelir.
    name: "media.cleanup-pending",
    cron: "*/15 * * * *",
    run: () => cleanupPendingAssets(),
  },
  {
    name: "maintenance.prune-outbox",
    cron: "30 3 * * *",
    run: () => pruneOutbox(7),
  },
];

/** Kuyrukların ve zamanlanmış işlerin tek kayıt noktası. */
export async function registerJobs(boss: PgBoss) {
  const withBoss: JobDefinition[] = [
    {
      // Son senkronizasyonu 6 saatten eski kullanıcıları kuyruğa atar (oyun kapanınca presence de tetikler).
      name: "steam.sync-all",
      cron: "15 */6 * * *",
      run: async () => {
        const userIds = await usersDueForSync(6);
        for (const userId of userIds) await enqueueSteamSync(boss, userId);
        return { queued: userIds.length };
      },
    },
    {
      // PSN/Xbox hesaplarını 6 saatte bir kuyruğa atar.
      name: "platforms.sync-all",
      cron: "45 */6 * * *",
      run: async () => {
        const accounts = await platformAccountsDueForSync(6);
        for (const account of accounts) {
          await enqueuePlatformSync(boss, account.userId, account.provider as "psn" | "xbox");
        }
        return { queued: accounts.length };
      },
    },
  ];
  for (const job of [...jobs, ...withBoss]) {
    const policy = job.policy ?? "standard";
    // Politika sonradan değiştirilemez; değiştiyse kuyruk yeniden açılır (işler idempotent, bekleyen iş
    // kaybı zararsız).
    const existing = await boss.getQueue(job.name);
    if (existing && existing.policy !== policy) await boss.deleteQueue(job.name);
    await boss.createQueue(job.name, {
      policy,
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds: 30 * 60,
    });
    await boss.work<Record<string, unknown>>(
      job.name,
      { localConcurrency: job.concurrency ?? 1 },
      async (batch) => {
        for (const item of batch) {
          const started = Date.now();
          const result = await job.run(item.data ?? {});
          console.info(`[job] ${job.name} ${Date.now() - started}ms`, result ?? "");
        }
      },
    );
    if (job.cron) await boss.schedule(job.name, job.cron);
  }
}

export type { JobDefinition };

/** Kullanıcı için senkronizasyon ister; zaten bekleyen varsa yenisi eklenmez. */
export function enqueueSteamSync(boss: PgBoss, userId: string) {
  return boss.send("steam.sync-user", { userId }, { singletonKey: userId });
}

export function enqueuePlatformSync(boss: PgBoss, userId: string, provider: "psn" | "xbox") {
  return boss.send(`${provider}.sync-user`, { userId }, { singletonKey: userId });
}
