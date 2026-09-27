import { schema } from "@my-games/db";
import { gameCoverUrl, slugify, steamCapsuleUrl, type TermKind } from "@my-games/shared";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { igdbConfig } from "./config";
import { type DbOrTx, db } from "./db";
import { AppError, notFound } from "./errors";
import {
  fetchIgdbGame,
  findIgdbIdBySteamApp,
  type IgdbSearchResult,
  mapIgdbGame,
  searchIgdbGames,
} from "./igdb/games";
import { entryPlaytime } from "./playtime";

const { games, terms, gameTerms, libraryEntries, user, gameExternalIds } = schema;

export type Game = typeof games.$inferSelect;

/** Katalogda benzersiz bir slug üretir: ad → ad-yıl → ad-kısa-id. */
async function uniqueSlug(tx: DbOrTx, name: string, releaseDate?: string | null, extra?: string) {
  const base = slugify(name);
  const candidates = [base];
  if (releaseDate) candidates.push(`${base}-${releaseDate.slice(0, 4)}`);
  candidates.push(`${base}-${extra ?? crypto.randomUUID().slice(0, 6)}`);
  for (const candidate of candidates) {
    const [taken] = await tx
      .select({ id: games.id })
      .from(games)
      .where(eq(games.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function replaceTerms(
  tx: DbOrTx,
  gameId: string,
  mapped: Array<{ kind: TermKind; igdbId: number; name: string; role: string }>,
) {
  await tx.delete(gameTerms).where(eq(gameTerms.gameId, gameId));
  if (mapped.length === 0) return;

  const unique = new Map<string, { kind: TermKind; igdbId: number; name: string }>();
  for (const term of mapped) unique.set(`${term.kind}:${term.igdbId}`, term);
  const rows = [...unique.values()].map((term) => ({
    kind: term.kind,
    igdbId: term.igdbId,
    name: term.name,
    slug: `${slugify(term.name)}-${term.igdbId}`,
  }));
  const saved = await tx
    .insert(terms)
    .values(rows)
    .onConflictDoUpdate({
      target: [terms.kind, terms.igdbId],
      set: { name: sql`excluded.name` },
    })
    .returning({ id: terms.id, kind: terms.kind, igdbId: terms.igdbId });
  const idOf = new Map(saved.map((term) => [`${term.kind}:${term.igdbId}`, term.id]));

  const links = mapped
    .map((term) => ({ gameId, termId: idOf.get(`${term.kind}:${term.igdbId}`), role: term.role }))
    .filter((link): link is { gameId: string; termId: number; role: string } => !!link.termId);
  if (links.length > 0) await tx.insert(gameTerms).values(links).onConflictDoNothing();
}

/**
 * IGDB oyununu kataloğa alır (varsa mevcut kaydı döner). Aynı Steam uygulaması daha önce IGDB'siz
 * eklendiyse o kayıt IGDB verisiyle zenginleştirilir, yeni kayıt açılmaz.
 */
export async function importIgdbGame(igdbId: number): Promise<Game> {
  const [existing] = await db.select().from(games).where(eq(games.igdbId, igdbId)).limit(1);
  if (existing) return existing;

  const fetched = await fetchIgdbGame(igdbId);
  if (!fetched) notFound("IGDB oyunu bulunamadı");
  const mapped = mapIgdbGame(fetched.game, fetched.timeToBeat);

  return db.transaction(async (tx) => {
    const [again] = await tx.select().from(games).where(eq(games.igdbId, igdbId)).limit(1);
    if (again) return again;

    const [steamOwner] = mapped.game.steamAppId
      ? await tx.select().from(games).where(eq(games.steamAppId, mapped.game.steamAppId)).limit(1)
      : [];

    let row: Game | undefined;
    if (steamOwner && !steamOwner.igdbId) {
      [row] = await tx
        .update(games)
        .set({ ...mapped.game, metadataSyncedAt: new Date() })
        .where(eq(games.id, steamOwner.id))
        .returning();
    } else {
      // Steam uygulaması başka bir IGDB oyununa bağlıysa (IGDB'de çift kayıt) bu oyun onsuz eklenir.
      const values = steamOwner ? { ...mapped.game, steamAppId: null } : mapped.game;
      const slug = await uniqueSlug(tx, mapped.game.name, mapped.game.releaseDate, String(igdbId));
      [row] = await tx
        .insert(games)
        .values({ ...values, slug, metadataSyncedAt: new Date() })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        // Aynı oyunu eşzamanlı içe aktaran başka bir istek kazandı.
        const [raced] = await tx.select().from(games).where(eq(games.igdbId, igdbId)).limit(1);
        if (raced) return raced;
        throw new AppError("conflict", "Oyun kaydedilemedi, tekrar dene");
      }
    }
    if (!row) throw new AppError("conflict", "Oyun kaydedilemedi");
    await replaceTerms(tx, row.id, mapped.terms);
    return row;
  });
}

/** Katalogdaki bir IGDB oyununun metadata'sını tazeler (worker haftalık çağırır). */
export async function refreshIgdbGame(gameId: string) {
  const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!game?.igdbId) return null;
  const fetched = await fetchIgdbGame(game.igdbId);
  if (!fetched) return null;
  const mapped = mapIgdbGame(fetched.game, fetched.timeToBeat);
  // Steam kimliği yalnızca boşsa ve başka oyunda değilse doldurulur: sync'in/eşleştirmenin koyduğu kimlik
  // IGDB'de eksik diye silinmesin.
  const { steamAppId, ...metadata } = mapped.game;
  return db.transaction(async (tx) => {
    const [owner] =
      steamAppId && !game.steamAppId
        ? await tx.select({ id: games.id }).from(games).where(eq(games.steamAppId, steamAppId))
        : [];
    const fillSteam = steamAppId && !game.steamAppId && !owner ? { steamAppId } : {};
    // Ad değişse bile slug sabit kalır; paylaşılan linkler kırılmasın.
    const [row] = await tx
      .update(games)
      .set({ ...metadata, ...fillSteam, metadataSyncedAt: new Date() })
      .where(eq(games.id, gameId))
      .returning();
    await replaceTerms(tx, gameId, mapped.terms);
    return row ?? null;
  });
}

export async function createCustomGame(
  userId: string,
  input: { name: string; releaseDate?: string | null; coverUrl?: string | null },
) {
  const name = input.name.trim();
  if (!name) throw new AppError("invalid", "Oyun adı boş olamaz");
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, name, input.releaseDate);
    const [row] = await tx
      .insert(games)
      .values({
        source: "custom",
        name,
        slug,
        releaseDate: input.releaseDate ?? null,
        coverUrl: input.coverUrl ?? null,
        createdById: userId,
      })
      .returning();
    if (!row) throw new AppError("conflict");
    return row;
  });
}

/**
 * Steam uygulamasını katalogda bulur ya da oluşturur. IGDB açıksa önce IGDB eşleşmesi aranır; değilse
 * Steam adı ve kapağıyla geçici bir kayıt açılır (sonradan IGDB ile zenginleşebilir).
 */
export async function ensureSteamGame(appId: number, name: string): Promise<Game> {
  const existing = await findGameBySteamApp(db, appId);
  if (existing) return existing;

  if (igdbConfig()) {
    const igdbId = await findIgdbIdBySteamApp(appId).catch(() => null);
    if (igdbId) {
      const game = await importIgdbGame(igdbId);
      if (game.steamAppId === appId) return game;
      if (!game.steamAppId) {
        const [updated] = await db
          .update(games)
          .set({ steamAppId: appId })
          .where(and(eq(games.id, game.id), isNull(games.steamAppId)))
          .returning();
        if (updated) return updated;
      }
      // Oyunun asıl Steam kimliği başka (ör. GOTY sürümü): bu app ek kimlik olarak bağlanır.
      await linkExternalId(db, "steam", String(appId), game.id);
      return (await findGameBySteamApp(db, appId)) ?? game;
    }
  }

  return db.transaction(async (tx) => {
    const insert = (slug: string) =>
      tx
        .insert(games)
        .values({
          source: "steam",
          steamAppId: appId,
          name,
          slug,
          coverUrl: steamCapsuleUrl(appId),
        })
        .onConflictDoNothing()
        .returning();
    let [row] = await insert(await uniqueSlug(tx, name, null, String(appId)));
    if (row) return row;
    const raced = await findGameBySteamApp(tx, appId);
    if (raced) return raced;
    // Çakışan slug'dı (eşzamanlı başka oyun): rastgele sonekle bir kez daha.
    [row] = await insert(`${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`);
    if (!row) throw new AppError("conflict");
    return row;
  });
}

/** Steam uygulamasının katalogdaki oyunu: asıl kimlik ya da ek kimlik (`game_external_ids`). */
export async function findGameBySteamApp(tx: DbOrTx, appId: number): Promise<Game | null> {
  const [direct] = await tx.select().from(games).where(eq(games.steamAppId, appId)).limit(1);
  if (direct) return direct;
  return findGameByExternalId(tx, "steam", String(appId));
}

/** Platform kimliğiyle (PSN `concept:<id>`, Xbox titleId, Steam ek app'i) eşlenmiş oyun. */
export async function findGameByExternalId(
  tx: DbOrTx,
  provider: string,
  externalId: string,
): Promise<Game | null> {
  const [row] = await tx
    .select({ game: games })
    .from(gameExternalIds)
    .innerJoin(games, eq(games.id, gameExternalIds.gameId))
    .where(and(eq(gameExternalIds.provider, provider), eq(gameExternalIds.externalId, externalId)))
    .limit(1);
  return row?.game ?? null;
}

/** Platform kimliğini oyuna bağlar; kimlik zaten başka oyuna bağlıysa dokunmaz. */
export async function linkExternalId(
  tx: DbOrTx,
  provider: string,
  externalId: string,
  gameId: string,
) {
  await tx.insert(gameExternalIds).values({ provider, externalId, gameId }).onConflictDoNothing();
}

/**
 * Steam dışı platform başlığını (PSN, Xbox) katalogda bulur ya da oluşturur. Sıra: platform kimliği →
 * IGDB'de yüksek güvenli ad eşleşmesi → platformun adı ve görseliyle geçici oyun (gece IGDB eşleştirmesi
 * sonra zenginleştirir). Bulunan oyun platform kimliğine bağlanır.
 */
export async function ensurePlatformGame(
  provider: "psn" | "xbox",
  externalId: string,
  name: string,
  imageUrl?: string | null,
): Promise<Game> {
  const known = await findGameByExternalId(db, provider, externalId);
  if (known) return known;

  if (igdbConfig()) {
    const { findIgdbCandidates, pickAutoMatch } = await import("./matching");
    const best = pickAutoMatch(await findIgdbCandidates(name).catch(() => []));
    if (best) {
      const game = await importIgdbGame(best.igdbId);
      await linkExternalId(db, provider, externalId, game.id);
      return (await findGameByExternalId(db, provider, externalId)) ?? game;
    }
  }

  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, name, null);
    const [row] = await tx
      .insert(games)
      .values({ source: provider, name, slug, coverUrl: imageUrl ?? null })
      .returning();
    if (!row) throw new AppError("conflict");
    await linkExternalId(tx, provider, externalId, row.id);
    // Eşzamanlı başka bir sync aynı başlığı bağladıysa onunki kullanılır (bizimki sahipsiz kalır, gece
    // eşleştirmesi IGDB'ye birleştirir).
    return (await findGameByExternalId(tx, provider, externalId)) ?? row;
  });
}

// --- Arama ---

const searchCache = new Map<string, { at: number; results: IgdbSearchResult[] }>();
const SEARCH_TTL_MS = 10 * 60 * 1000;

async function cachedIgdbSearch(query: string) {
  const key = query.trim().toLowerCase();
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.results;
  const results = await searchIgdbGames(key);
  if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value as string);
  searchCache.set(key, { at: Date.now(), results });
  return results;
}

export type CatalogSearchResult = {
  igdbId: number | null;
  gameId: string | null;
  slug: string | null;
  name: string;
  coverUrl: string | null;
  releaseYear: number | null;
  gameType: string | null;
  inLibrary: boolean;
};

/** IGDB + katalogdaki IGDB'siz oyunlar. Kullanıcı verilirse kütüphanesindekiler işaretlenir. */
export async function searchCatalog(
  query: string,
  userId?: string,
): Promise<CatalogSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [igdbResults, localRows] = await Promise.all([
    igdbConfig() ? cachedIgdbSearch(q).catch(() => []) : Promise.resolve([]),
    db
      .select()
      .from(games)
      .where(
        sql`lower(${games.name}) % lower(${q}) or lower(${games.name}) like ${`%${q.toLowerCase()}%`}`,
      )
      .orderBy(sql`similarity(lower(${games.name}), lower(${q})) desc`)
      .limit(10),
  ]);

  const igdbIds = igdbResults.map((result) => result.igdbId);
  const known = igdbIds.length
    ? await db.select().from(games).where(inArray(games.igdbId, igdbIds))
    : [];
  const knownByIgdb = new Map(known.map((game) => [game.igdbId, game]));

  const results: CatalogSearchResult[] = igdbResults.map((result) => {
    const game = knownByIgdb.get(result.igdbId);
    return {
      igdbId: result.igdbId,
      gameId: game?.id ?? null,
      slug: game?.slug ?? null,
      name: result.name,
      coverUrl: gameCoverUrl({ coverImageId: result.coverImageId }, "cover_small"),
      releaseYear: result.releaseYear,
      gameType: result.gameType,
      inLibrary: false,
    };
  });
  for (const game of localRows) {
    if (game.igdbId && igdbIds.includes(game.igdbId)) continue;
    results.push({
      igdbId: game.igdbId,
      gameId: game.id,
      slug: game.slug,
      name: game.name,
      coverUrl: gameCoverUrl(game, "cover_small"),
      releaseYear: game.releaseDate ? Number(game.releaseDate.slice(0, 4)) : null,
      gameType: game.gameType,
      inLibrary: false,
    });
  }

  if (userId) {
    const gameIds = results.map((result) => result.gameId).filter((id): id is string => !!id);
    if (gameIds.length) {
      const owned = await db
        .select({ gameId: libraryEntries.gameId })
        .from(libraryEntries)
        .where(and(eq(libraryEntries.userId, userId), inArray(libraryEntries.gameId, gameIds)));
      const ownedIds = new Set(owned.map((row) => row.gameId));
      for (const result of results)
        result.inLibrary = !!result.gameId && ownedIds.has(result.gameId);
    }
  }
  return results;
}

// --- Oyun sayfası ---

export async function getGameBySlug(slug: string) {
  const [game] = await db.select().from(games).where(eq(games.slug, slug)).limit(1);
  if (!game) notFound("Oyun bulunamadı");

  const [termRows, stats, reviews] = await Promise.all([
    db
      .select({ kind: terms.kind, name: terms.name, slug: terms.slug, role: gameTerms.role })
      .from(gameTerms)
      .innerJoin(terms, eq(terms.id, gameTerms.termId))
      .where(eq(gameTerms.gameId, game.id)),
    db
      .select({
        players: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${libraryEntries.status} = 'completed')::int`,
        playing: sql<number>`count(*) filter (where ${libraryEntries.status} = 'playing')::int`,
        averageRating: sql<number | null>`round(avg(${libraryEntries.rating}))::int`,
        ratingCount: sql<number>`count(${libraryEntries.rating})::int`,
        totalPlaytimeMin: sql<number>`coalesce(sum(${entryPlaytime}), 0)::int`,
      })
      .from(libraryEntries)
      .where(eq(libraryEntries.gameId, game.id)),
    db
      .select({
        entryId: libraryEntries.id,
        review: libraryEntries.review,
        rating: libraryEntries.rating,
        status: libraryEntries.status,
        playtimeMin: entryPlaytime,
        updatedAt: libraryEntries.updatedAt,
        user: {
          id: user.id,
          name: user.name,
          username: user.displayUsername,
          image: user.image,
        },
      })
      .from(libraryEntries)
      .innerJoin(user, eq(user.id, libraryEntries.userId))
      .where(and(eq(libraryEntries.gameId, game.id), isNotNull(libraryEntries.review)))
      .orderBy(desc(libraryEntries.updatedAt))
      .limit(50),
  ]);

  const grouped: Record<string, Array<{ name: string; slug: string }>> = {};
  for (const term of termRows) {
    const key = term.kind === "company" ? term.role || "company" : term.kind;
    const bucket = grouped[key] ?? [];
    bucket.push({ name: term.name, slug: term.slug });
    grouped[key] = bucket;
  }

  return {
    game: { ...game, coverUrl: gameCoverUrl(game, "cover_big") },
    terms: grouped,
    stats: stats[0] ?? null,
    reviews: reviews.filter((review) => review.review?.trim()),
  };
}

/** Metadata'sı 30 günden eski IGDB oyunlarını tazeler (worker haftalık, küçük partilerle çağırır). */
export async function refreshStaleGames(limit = 50) {
  if (!igdbConfig()) return 0;
  const rows = await db
    .select({ id: games.id })
    .from(games)
    .where(
      sql`${games.igdbId} is not null and (${games.metadataSyncedAt} is null or ${games.metadataSyncedAt} < now() - interval '30 days')`,
    )
    .orderBy(sql`${games.metadataSyncedAt} asc nulls first`)
    .limit(limit);
  let refreshed = 0;
  for (const row of rows) {
    try {
      if (await refreshIgdbGame(row.id)) refreshed++;
      else await markSynced(row.id);
    } catch (error) {
      // Sürekli hata veren oyun her haftaki partiyi doldurmasın: deneme zamanı yine de yazılır.
      await markSynced(row.id);
      console.error("[catalog] yenileme başarısız", row.id, error);
    }
  }
  return refreshed;
}

async function markSynced(gameId: string) {
  await db.update(games).set({ metadataSyncedAt: new Date() }).where(eq(games.id, gameId));
}

export async function findGameIdBySlug(slug: string) {
  const [row] = await db.select({ id: games.id }).from(games).where(eq(games.slug, slug)).limit(1);
  if (!row) notFound("Oyun bulunamadı");
  return row.id;
}
