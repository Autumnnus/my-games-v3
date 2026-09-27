import { schema } from "@my-games/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { findGameBySteamApp } from "../catalog";
import { db } from "../db";
import { notifyPending, propose, ruleFor } from "../proposals";
import { insertPlatformScreenshots, type PlatformScreenshot } from "../screenshots";
import { getUserScreenshots, type SteamPublishedFile } from "./api";

const { steamAccounts, screenshots, libraryEntries, changeProposals } = schema;

/** Her sync'te en fazla bu kadar sayfa (100'lük) taranır; eski görüntüler zaten içe aktarılmıştır. */
const MAX_PAGES = 5;
const PER_PAGE = 100;

function toScreenshot(file: SteamPublishedFile): PlatformScreenshot | null {
  if (!file.file_url || !file.publishedfileid) return null;
  const caption = (file.title || file.file_description || "").trim();
  return {
    externalId: `steam:${file.publishedfileid}`,
    url: file.file_url,
    thumbUrl: file.preview_url ?? null,
    caption: caption ? caption.slice(0, 500) : null,
    width: file.image_width ?? null,
    height: file.image_height ?? null,
    takenAt: file.time_created ? new Date(file.time_created * 1000).toISOString() : null,
  };
}

/** Kullanıcının reddettiği ekran görüntüsü önerilerindeki görseller bir daha önerilmez. */
async function rejectedIds(userId: string) {
  const rows = await db
    .select({ payload: changeProposals.payload })
    .from(changeProposals)
    .where(
      and(
        eq(changeProposals.userId, userId),
        eq(changeProposals.kind, "screenshots"),
        eq(changeProposals.status, "rejected"),
      ),
    );
  return new Set(
    rows.flatMap((row) =>
      ((row.payload as { items?: Array<{ externalId: string }> }).items ?? []).map(
        (item) => item.externalId,
      ),
    ),
  );
}

/**
 * Steam'de herkese açık paylaşılan ekran görüntülerini ilgili kütüphane kaydına ekler (kural: otomatik /
 * onayla / yok say). Görseller Steam'in adresinden gösterilir, depoya kopyalanmaz. İlk içe aktarım akışa
 * düşmez. Kütüphanede olmayan oyunların görüntüleri, oyun eklenince sonraki sync'te gelir.
 */
export async function syncSteamScreenshots(userId: string) {
  const [account] = await db.select().from(steamAccounts).where(eq(steamAccounts.userId, userId));
  if (!account?.syncEnabled) return { imported: 0, proposed: 0 };
  const action = await ruleFor(db, userId, "steam", "screenshots");
  if (action === "ignore") return { imported: 0, proposed: 0 };

  const known = new Set(
    (
      await db
        .select({ externalId: screenshots.externalId, url: screenshots.url })
        .from(screenshots)
        .where(and(eq(screenshots.userId, userId), isNotNull(screenshots.url)))
    ).flatMap((row) => [row.externalId, row.url].filter((value): value is string => !!value)),
  );
  const rejected = await rejectedIds(userId);

  const files: SteamPublishedFile[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await getUserScreenshots(account.steamId, page, PER_PAGE);
    files.push(...result.files);
    const allKnown = result.files.every(
      (file) => known.has(`steam:${file.publishedfileid}`) || known.has(file.file_url ?? ""),
    );
    if (result.files.length < PER_PAGE || allKnown) break;
  }

  // Oyuna göre grupla; yalnızca kütüphanedeki oyunlar.
  const entries = await db
    .select({ id: libraryEntries.id, gameId: libraryEntries.gameId })
    .from(libraryEntries)
    .where(eq(libraryEntries.userId, userId));
  const entryByGame = new Map(entries.map((entry) => [entry.gameId, entry.id]));
  const gameOfEntry = new Map(entries.map((entry) => [entry.id, entry.gameId]));
  const gameByApp = new Map<number, string | null>();
  const groups = new Map<string, PlatformScreenshot[]>();
  for (const file of files) {
    const shot = toScreenshot(file);
    if (!shot || !file.consumer_appid) continue;
    if (known.has(shot.externalId) || known.has(shot.url) || rejected.has(shot.externalId))
      continue;
    if (!gameByApp.has(file.consumer_appid)) {
      gameByApp.set(
        file.consumer_appid,
        (await findGameBySteamApp(db, file.consumer_appid))?.id ?? null,
      );
    }
    const gameId = gameByApp.get(file.consumer_appid);
    const entryId = gameId ? entryByGame.get(gameId) : undefined;
    if (!entryId) continue;
    groups.set(entryId, [...(groups.get(entryId) ?? []), shot]);
  }

  const firstImport = !account.screenshotsSyncedAt;
  let imported = 0;
  let proposed = 0;
  await db.transaction(async (tx) => {
    for (const [entryId, items] of groups) {
      if (action === "auto") {
        const rows = await insertPlatformScreenshots(tx, {
          userId,
          entryId,
          gameId: null,
          items,
          announce: !firstImport,
        });
        imported += rows.length;
        continue;
      }
      const result = await propose(tx, {
        userId,
        source: "steam",
        kind: "screenshots",
        entryId,
        gameId: gameOfEntry.get(entryId) ?? null,
        dedupeKey: `steam:screenshots:${entryId}`,
        payload: { op: "screenshots", items },
      });
      if (result.created) proposed++;
    }
    await tx
      .update(steamAccounts)
      .set({ screenshotsSyncedAt: new Date() })
      .where(eq(steamAccounts.userId, userId));
    await notifyPending(tx, userId, proposed);
  });
  return { imported, proposed };
}
