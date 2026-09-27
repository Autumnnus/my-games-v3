import { schema } from "@my-games/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { importIgdbGame } from "./catalog";
import { igdbConfig } from "./config";
import { type DbOrTx, db } from "./db";
import { type IgdbSearchResult, searchIgdbGames } from "./igdb/games";
import { titleSimilarity } from "./text";

export type MatchCandidate = IgdbSearchResult & { score: number };

/** Otomatik eşleşme için en iyi aday bu skoru geçmeli ve ikinciden belirgin şekilde iyi olmalı. */
export const AUTO_MATCH_SCORE = 0.92;
const AUTO_MATCH_MARGIN = 0.08;

/** Bir oyun adını IGDB'de arar, adayları benzerlik skoruna göre sıralar. */
export async function findIgdbCandidates(name: string, limit = 5): Promise<MatchCandidate[]> {
  if (!igdbConfig()) return [];
  const results = await searchIgdbGames(name, 10);
  return results
    .map((result) => ({ ...result, score: titleSimilarity(name, result.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function pickAutoMatch(candidates: MatchCandidate[]) {
  const [best, second] = candidates;
  if (!best || best.score < AUTO_MATCH_SCORE) return null;
  if (second && best.score - second.score < AUTO_MATCH_MARGIN && second.score >= AUTO_MATCH_SCORE) {
    return null;
  }
  return best;
}

/**
 * IGDB'siz (eski/elle eklenmiş/Steam'den açılmış) bir oyunu başka bir oyunla birleştirir: kayıtlar ve ona
 * bağlı her şey (screenshot, oturum, aktivite, geçmiş, öneri) yeni oyuna taşınır. Hedefte zaten kaydı olan
 * kullanıcının eski kaydı yerinde kalır. `userId` verilirse yalnızca o kullanıcının verisi taşınır (kullanıcı
 * onayıyla yapılan eşleştirme başkalarının kaydını değiştirmesin). Eski oyunu kimse kullanmıyorsa silinir;
 * Steam uygulama kimliği hedefe geçer ki sonraki sync aynı oyunu yeniden açmasın.
 */
export async function mergeGameInto(
  tx: DbOrTx,
  fromGameId: string,
  toGameId: string,
  options: { userId?: string } = {},
) {
  if (fromGameId === toGameId) return;
  const {
    libraryEntries,
    screenshots,
    playSessions,
    activities,
    entryHistory,
    changeProposals,
    games,
    steamAppAliases,
  } = schema;

  await tx.execute(sql`
    update ${libraryEntries} set game_id = ${toGameId}
    where game_id = ${fromGameId}
      and user_id not in (select user_id from ${libraryEntries} where game_id = ${toGameId})
      ${options.userId ? sql`and user_id = ${options.userId}` : sql``}
  `);

  // Kaydı eski oyunda kalmayan kullanıcıların oyuna bağlı tüm satırları taşınır (kaydı olmayanlar dahil:
  // bekleyen "yeni oyun" önerileri ve onların oturumları).
  const moveReferences = async (userId?: string) => {
    const movable = (owner: AnyPgColumn) => sql`${sql.identifier("game_id")} = ${fromGameId}
      and ${owner} not in (select user_id from ${libraryEntries} where game_id = ${fromGameId})
      ${userId ? sql`and ${owner} = ${userId}` : sql``}`;
    const tables = [
      [screenshots, screenshots.userId],
      [playSessions, playSessions.userId],
      [activities, activities.actorId],
      [entryHistory, entryHistory.userId],
    ] as const;
    for (const [table, owner] of tables) {
      await tx.execute(sql`update ${table} set game_id = ${toGameId} where ${movable(owner)}`);
    }
    // Bu kullanıcılar için eşleştirme sorusu artık cevaplandı.
    await tx.execute(sql`
      update ${changeProposals} set status = 'superseded', resolved_at = now()
      where ${movable(changeProposals.userId)} and kind = 'match' and status = 'pending'
    `);
    await tx.execute(sql`
      update ${changeProposals}
      set game_id = ${toGameId},
          payload = case when payload->>'op' = 'create'
            then jsonb_set(payload, '{game,gameId}', to_jsonb(${toGameId}::text))
            else payload end
      where ${movable(changeProposals.userId)}
    `);
  };
  await moveReferences(options.userId);

  const [stillUsed] = await tx
    .select({ id: libraryEntries.id })
    .from(libraryEntries)
    .where(eq(libraryEntries.gameId, fromGameId))
    .limit(1);
  if (stillUsed) return;

  await moveReferences();
  await tx
    .update(steamAppAliases)
    .set({ gameId: toGameId })
    .where(eq(steamAppAliases.gameId, fromGameId));
  const [source] = await tx
    .select({ steamAppId: games.steamAppId })
    .from(games)
    .where(eq(games.id, fromGameId));
  if (source?.steamAppId) {
    // Unique index yüzünden önce kaynaktan kaldırılır. Hedefin kendi Steam kimliği varsa bu app ek kimlik
    // olur; her iki durumda da sonraki sync aynı oyunu yeniden açmaz.
    await tx.update(games).set({ steamAppId: null }).where(eq(games.id, fromGameId));
    const [moved] = await tx
      .update(games)
      .set({ steamAppId: source.steamAppId })
      .where(and(eq(games.id, toGameId), isNull(games.steamAppId)))
      .returning({ id: games.id });
    if (!moved) {
      await tx
        .insert(steamAppAliases)
        .values({ appId: source.steamAppId, gameId: toGameId })
        .onConflictDoNothing();
    }
  }
  await tx.delete(games).where(eq(games.id, fromGameId));
}

/**
 * IGDB oyununu içe aktarır ve eski oyunu onunla birleştirir. `userId` verilirse (kullanıcının onayladığı
 * eşleştirme) yalnızca o kullanıcının kaydı taşınır.
 */
export async function matchGameToIgdb(gameId: string, igdbId: number, userId?: string) {
  const target = await importIgdbGame(igdbId);
  await db.transaction((tx) => mergeGameInto(tx, gameId, target.id, { userId }));
  return target;
}

/**
 * IGDB'siz oyunlar (eski veri, elle eklenenler) için eşleşme arar. Yüksek güvenli eşleşmeler doğrudan
 * birleştirilir; belirsizler oyunu kütüphanesinde tutan her kullanıcıya öneri olarak gider. Her oyun en
 * fazla haftada bir denenir (`metadata_synced_at` deneme zamanı olarak kullanılır).
 */
export async function matchUnlinkedGames(limit = 25) {
  if (!igdbConfig()) return { checked: 0, merged: 0, proposed: 0 };
  const { games, libraryEntries } = schema;
  const rows = await db
    .select({ id: games.id, name: games.name })
    .from(games)
    .where(
      sql`${games.igdbId} is null and ${games.source} in ('legacy', 'custom', 'steam')
          and (${games.metadataSyncedAt} is null or ${games.metadataSyncedAt} < now() - interval '7 days')`,
    )
    .limit(limit);

  const { propose, notifyPending } = await import("./proposals");
  let merged = 0;
  let proposed = 0;
  for (const game of rows) {
    await db.update(games).set({ metadataSyncedAt: new Date() }).where(eq(games.id, game.id));
    const candidates = await findIgdbCandidates(game.name).catch(() => []);
    const best = pickAutoMatch(candidates);
    if (best) {
      await matchGameToIgdb(game.id, best.igdbId);
      merged++;
      continue;
    }
    if (candidates.length === 0) continue;
    const owners = await db
      .select({ userId: libraryEntries.userId, entryId: libraryEntries.id })
      .from(libraryEntries)
      .where(eq(libraryEntries.gameId, game.id));
    for (const owner of owners) {
      await db.transaction(async (tx) => {
        const result = await propose(tx, {
          userId: owner.userId,
          source: "igdb",
          kind: "match",
          gameId: game.id,
          entryId: owner.entryId,
          dedupeKey: `igdb:match:${game.id}`,
          confidence: candidates[0]?.score ?? null,
          payload: { op: "match", gameName: game.name, candidates },
        });
        if (result.created) {
          proposed++;
          await notifyPending(tx, owner.userId, 1);
        }
      });
    }
  }
  return { checked: rows.length, merged, proposed };
}
