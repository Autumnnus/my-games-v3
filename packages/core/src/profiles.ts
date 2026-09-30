import { schema } from "@my-games/db";
import { type EntryStatus, entryStatuses, gameCoverUrl, type Platform } from "@my-games/shared";
import { and, desc, eq, ilike, inArray, isNotNull, or, type SQL, sql } from "drizzle-orm";
import { localToday } from "./config";
import { db } from "./db";
import { notFound } from "./errors";
import { selectEntries } from "./library";
import { entryPlaytime } from "./playtime";
import { listScreenshots } from "./screenshots";
import { findUserByUsername } from "./users";

const { user, libraryEntries, games, steamAccounts, playSessions } = schema;

// --- Kullanıcılar dizini ---

export const userDirectorySorts = ["active", "games", "new"] as const;
export type UserDirectorySort = (typeof userDirectorySorts)[number];

const PAGE_SIZE = 24;
const COVERS_PER_USER = 4;

export type DirectoryCover = { name: string; coverUrl: string; slug: string };

/** Sayfadaki kişilerin en son güncellenen, kapağı olan birkaç oyunu (kişi başına tek sorgu değil, toplu). */
async function recentCovers(userIds: string[]) {
  const covers = new Map<string, DirectoryCover[]>();
  if (userIds.length === 0) return covers;
  const ranked = db
    .select({
      userId: libraryEntries.userId,
      name: games.name,
      slug: games.slug,
      coverImageId: games.coverImageId,
      coverUrl: games.coverUrl,
      rank: sql<number>`row_number() over (partition by ${libraryEntries.userId} order by ${libraryEntries.updatedAt} desc, ${libraryEntries.id})`.as(
        "rank",
      ),
    })
    .from(libraryEntries)
    .innerJoin(games, eq(games.id, libraryEntries.gameId))
    .where(
      and(
        inArray(libraryEntries.userId, userIds),
        or(isNotNull(games.coverImageId), isNotNull(games.coverUrl)),
      ),
    )
    .as("ranked");
  const rows = await db
    .select()
    .from(ranked)
    .where(sql`${ranked.rank} <= ${COVERS_PER_USER}`)
    .orderBy(ranked.userId, ranked.rank);
  for (const row of rows) {
    const coverUrl = gameCoverUrl(row);
    if (!coverUrl) continue;
    const list = covers.get(row.userId) ?? [];
    list.push({ name: row.name, coverUrl, slug: row.slug });
    covers.set(row.userId, list);
  }
  return covers;
}

/**
 * Herkese açık kullanıcı listesi: özet sayılar, son etkinlik, Steam'de oynadığı oyun ve birkaç kapak.
 * Banlananlar listelenmez (akıştaki gibi). Sayılar `getProfile` özetiyle aynı anlamdadır.
 */
export async function listUsers(
  input: { q?: string; sort?: UserDirectorySort; offset?: number } = {},
) {
  const offset = Math.max(0, input.offset ?? 0);
  const conditions: SQL[] = [
    sql`coalesce(${user.banned}, false) = false`,
    // Profil bağlantısı kullanıcı adıyla kurulur; adı olmayan hesap (olmamalı) listeye girmez.
    isNotNull(user.username),
  ];
  const q = input.q?.trim().replace(/^@/, "").slice(0, 64);
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const match = or(
      ilike(user.name, pattern),
      ilike(user.username, pattern),
      ilike(user.displayUsername, pattern),
    );
    if (match) conditions.push(match);
  }

  // Toplam fonksiyonlu, gruplamasız alt sorgu her kişi için tam bir satır döner (kaydı olmayana da 0).
  const summary = db
    .select({
      games: sql<number>`count(*)::int`.as("games"),
      completed:
        sql<number>`count(*) filter (where ${libraryEntries.status} = 'completed')::int`.as(
          "completed",
        ),
      playing: sql<number>`count(*) filter (where ${libraryEntries.status} = 'playing')::int`.as(
        "playing",
      ),
      playtimeMin: sql<number>`coalesce(sum(${entryPlaytime}), 0)::int`.as("playtime_min"),
      averageRating: sql<number | null>`round(avg(${libraryEntries.rating}))::int`.as(
        "average_rating",
      ),
      // `greatest` null'ları atlar: son oynama yoksa güncelleme zamanı sayılır.
      lastActiveAt: sql<
        string | null
      >`max(greatest(${libraryEntries.updatedAt}, ${libraryEntries.lastPlayedAt}))`.as(
        "last_active_at",
      ),
    })
    .from(libraryEntries)
    .where(eq(libraryEntries.userId, user.id))
    .as("summary");

  const lastActive = sql`${summary.lastActiveAt} desc nulls last`;
  const order = {
    active: [lastActive, desc(user.createdAt)],
    games: [sql`${summary.games} desc`, lastActive],
    new: [desc(user.createdAt)],
  }[input.sort ?? "active"];

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      username: sql<string>`coalesce(${user.displayUsername}, ${user.username})`,
      image: user.image,
      bio: user.bio,
      createdAt: user.createdAt,
      games: summary.games,
      completed: summary.completed,
      playing: summary.playing,
      playtimeMin: summary.playtimeMin,
      averageRating: summary.averageRating,
      lastActiveAt: summary.lastActiveAt,
      // Presence yalnızca senkronu açık hesaplarda tazelenir; kapalıysa eski değer gösterilmez.
      nowPlaying: sql<
        string | null
      >`case when ${steamAccounts.syncEnabled} and ${steamAccounts.currentAppId} is not null then ${steamAccounts.currentGameName} end`,
    })
    .from(user)
    .crossJoinLateral(summary)
    .leftJoin(steamAccounts, eq(steamAccounts.userId, user.id))
    .where(and(...conditions))
    .orderBy(...order, desc(user.id))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const page = rows.slice(0, PAGE_SIZE);
  const covers = await recentCovers(page.map((row) => row.id));
  return {
    users: page.map(({ nowPlaying, lastActiveAt, ...row }) => ({
      ...row,
      // Ham SQL ifadesi olduğu için drizzle Date'e çevirmez.
      lastActiveAt: lastActiveAt ? new Date(lastActiveAt) : null,
      nowPlaying: nowPlaying ? { name: nowPlaying } : null,
      covers: covers.get(row.id) ?? [],
    })),
    nextOffset: rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null,
  };
}

// --- Profil özeti ---

/**
 * Profilin "Genel bakış" sekmesi: kütüphaneden seçilmiş raflar (öğeler `listLibrary` ile aynı biçimde),
 * durum/platform dağılımı, son ekran görüntüleri ve bu yılın özeti. Bu yılın süresi Wrapped'deki gibi oyun
 * oturumlarından hesaplanır (kayıtlardaki toplam süreler yıla bölünemez).
 */
export async function getProfileOverview(username: string) {
  const found = await findUserByUsername(username);
  if (!found) notFound("Kullanıcı bulunamadı", "user_not_found");

  const own = eq(libraryEntries.userId, found.id);
  const updated = desc(libraryEntries.updatedAt);
  const year = Number(localToday().slice(0, 4));
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;

  const [
    nowPlaying,
    favorites,
    recentlyCompleted,
    topRated,
    recent,
    statusRows,
    platformRows,
    screenshots,
    [completedThisYear],
    [sessionsThisYear],
  ] = await Promise.all([
    selectEntries(
      and(own, eq(libraryEntries.status, "playing")),
      [sql`coalesce(${libraryEntries.lastPlayedAt}, ${libraryEntries.updatedAt}) desc`, updated],
      8,
    ),
    selectEntries(
      and(own, eq(libraryEntries.isFavorite, true)),
      [sql`${libraryEntries.rating} desc nulls last`, updated],
      12,
    ),
    selectEntries(
      and(own, eq(libraryEntries.status, "completed")),
      [sql`${libraryEntries.finishedAt} desc nulls last`, updated],
      8,
    ),
    selectEntries(
      and(own, isNotNull(libraryEntries.rating)),
      [desc(libraryEntries.rating), updated],
      8,
    ),
    selectEntries(own, [updated], 8),
    db
      .select({ status: libraryEntries.status, count: sql<number>`count(*)::int` })
      .from(libraryEntries)
      .where(own)
      .groupBy(libraryEntries.status),
    db
      .select({ platform: libraryEntries.platform, count: sql<number>`count(*)::int` })
      .from(libraryEntries)
      .where(and(own, isNotNull(libraryEntries.platform)))
      .groupBy(libraryEntries.platform)
      .orderBy(desc(sql`count(*)`), libraryEntries.platform),
    listScreenshots({ userId: found.id }, 8),
    // Wrapped ile aynı ölçüt: bu yıl bitirilmiş ve hâlâ "tamamlandı" durumunda olanlar.
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(libraryEntries)
      .where(
        and(
          own,
          eq(libraryEntries.status, "completed"),
          sql`${libraryEntries.finishedAt} >= ${start} and ${libraryEntries.finishedAt} < ${end}`,
        ),
      ),
    db
      .select({ minutes: sql<number>`coalesce(sum(${playSessions.durationMin}), 0)::int` })
      .from(playSessions)
      .where(
        and(
          eq(playSessions.userId, found.id),
          sql`${playSessions.endedAt} >= ${start}::date and ${playSessions.endedAt} < ${end}::date`,
        ),
      ),
  ]);

  const statusCounts = Object.fromEntries(entryStatuses.map((status) => [status, 0])) as Record<
    EntryStatus,
    number
  >;
  for (const row of statusRows) statusCounts[row.status] = row.count;

  return {
    nowPlaying,
    favorites,
    recentlyCompleted,
    topRated,
    recent,
    statusCounts,
    platforms: platformRows.flatMap(
      (row): Array<{ platform: Platform; count: number }> =>
        row.platform ? [{ platform: row.platform, count: row.count }] : [],
    ),
    screenshots,
    thisYear: {
      year,
      completed: completedThisYear?.count ?? 0,
      playtimeMin: sessionsThisYear?.minutes ?? 0,
    },
  };
}
