import { schema } from "@my-games/db";
import { gameCoverUrl } from "@my-games/shared";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import { aliasedPlaytime, entryPlaytime } from "./playtime";

const {
  libraryEntries: e,
  games: g,
  gameTerms,
  terms,
  playSessions,
  playEstimateDays,
  screenshots,
  user,
} = schema;

/** Toplam süre = elle girilen + platformlar. */
const playtime = entryPlaytime;

type Bucket = { key: string; count: number; playtimeMin: number };

function scope(userId?: string) {
  return userId ? eq(e.userId, userId) : undefined;
}

async function grouped(
  column: typeof e.status | typeof e.platform | typeof e.store,
  userId?: string,
) {
  const rows = await db
    .select({
      key: column,
      count: sql<number>`count(*)::int`,
      playtimeMin: sql<number>`coalesce(sum(${playtime}), 0)::int`,
    })
    .from(e)
    .where(and(scope(userId), isNotNull(column)))
    .groupBy(column)
    .orderBy(desc(sql`count(*)`));
  return rows as Bucket[];
}

/** Tür/tema/mod/bakış açısı veya geliştirici/yayıncı dağılımı (oyun sayısı, süre, ortalama puan). */
async function byTerm(
  kind: "genre" | "theme" | "game_mode" | "player_perspective" | "company",
  role: string,
  userId?: string,
  limit = 15,
) {
  return db
    .select({
      key: terms.name,
      count: sql<number>`count(distinct ${e.id})::int`,
      playtimeMin: sql<number>`coalesce(sum(${playtime}), 0)::int`,
      averageRating: sql<number | null>`round(avg(${e.rating}))::int`,
    })
    .from(e)
    .innerJoin(gameTerms, eq(gameTerms.gameId, e.gameId))
    .innerJoin(terms, eq(terms.id, gameTerms.termId))
    .where(and(scope(userId), eq(terms.kind, kind), eq(gameTerms.role, role)))
    .groupBy(terms.name)
    .orderBy(desc(sql`count(distinct ${e.id})`), desc(sql`sum(${playtime})`))
    .limit(limit);
}

export type HeatmapDay = { day: string; minutes: number; estimatedMinutes: number };

/**
 * Gün başına oynama süresi. `minutes` o günün toplamıdır; `estimatedMinutes` bunun takipten önceki
 * tahmin olan kısmı (bkz. core/estimates) ve arayüz bu günleri ayrıca işaretler. Yıl verilmezse son 371 gün.
 */
export async function activityHeatmap(userId: string, year?: number): Promise<HeatmapDay[]> {
  const [start, end] = year
    ? [sql`${`${year}-01-01`}::date`, sql`${`${year + 1}-01-01`}::date`]
    : [sql`current_date - 371`, sql`current_date + 1`];
  const rows = await db.execute<HeatmapDay>(sql`
    select to_char(day, 'YYYY-MM-DD') as day, sum(minutes)::int as minutes,
      sum(estimated)::int as "estimatedMinutes"
    from (
      select date_trunc('day', ${playSessions.endedAt})::date as day,
        ${playSessions.durationMin} as minutes, 0 as estimated
      from ${playSessions}
      where ${playSessions.userId} = ${userId}
        and ${playSessions.endedAt} >= ${start} and ${playSessions.endedAt} < ${end}
      union all
      select ${playEstimateDays.day}, ${playEstimateDays.minutes}, ${playEstimateDays.minutes}
      from ${playEstimateDays}
      where ${playEstimateDays.userId} = ${userId}
        and ${playEstimateDays.day} >= ${start} and ${playEstimateDays.day} < ${end}
    ) plays
    group by 1 order by 1
  `);
  return rows.rows;
}

/** Isı haritasında gösterilecek veri olan yıllar (gerçek oturum ya da tahmin), yeniden eskiye. */
export async function heatmapYears(userId: string) {
  const rows = await db.execute<{ year: number }>(sql`
    select distinct extract(year from ended_at)::int as year from ${playSessions} where user_id = ${userId}
    union
    select distinct extract(year from day)::int from ${playEstimateDays} where user_id = ${userId}
    order by year desc
  `);
  return rows.rows.map((row) => row.year);
}

export async function userStats(userId: string) {
  const [
    [totals],
    status,
    platform,
    store,
    genres,
    themes,
    modes,
    perspectives,
    developers,
    publishers,
  ] = await Promise.all([
    db
      .select({
        games: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${e.status} = 'completed')::int`,
        playtimeMin: sql<number>`coalesce(sum(${playtime}), 0)::int`,
        averageRating: sql<number | null>`round(avg(${e.rating}))::int`,
        rated: sql<number>`count(${e.rating})::int`,
        reviews: sql<number>`count(*) filter (where nullif(trim(${e.review}), '') is not null)::int`,
        favorites: sql<number>`count(*) filter (where ${e.isFavorite})::int`,
        perfect: sql<number>`count(*) filter (where ${e.achievementsTotal} > 0 and ${e.achievementsUnlocked} = ${e.achievementsTotal})::int`,
      })
      .from(e)
      .where(eq(e.userId, userId)),
    grouped(e.status, userId),
    grouped(e.platform, userId),
    grouped(e.store, userId),
    byTerm("genre", "", userId),
    byTerm("theme", "", userId),
    byTerm("game_mode", "", userId),
    byTerm("player_perspective", "", userId),
    byTerm("company", "developer", userId),
    byTerm("company", "publisher", userId),
  ]);

  const [
    releaseYears,
    ratings,
    completions,
    topPlayed,
    backlog,
    heatmap,
    [screenshotCount],
    years,
  ] = await Promise.all([
    db
      .select({
        key: sql<string>`extract(year from ${g.releaseDate})::int::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(e)
      .innerJoin(g, eq(g.id, e.gameId))
      .where(and(eq(e.userId, userId), isNotNull(g.releaseDate)))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        key: sql<string>`floor(${e.rating} / 10)::int::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(e)
      .where(and(eq(e.userId, userId), isNotNull(e.rating)))
      .groupBy(sql`1`)
      .orderBy(sql`min(${e.rating})`),
    db
      .select({
        key: sql<string>`extract(year from ${e.finishedAt})::int::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(e)
      .where(and(eq(e.userId, userId), eq(e.status, "completed"), isNotNull(e.finishedAt)))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        entryId: e.id,
        name: g.name,
        slug: g.slug,
        coverImageId: g.coverImageId,
        coverUrl: g.coverUrl,
        playtimeMin: sql<number>`${playtime}::int`,
        rating: e.rating,
      })
      .from(e)
      .innerJoin(g, eq(g.id, e.gameId))
      .where(and(eq(e.userId, userId), sql`${playtime} > 0`))
      .orderBy(desc(playtime))
      .limit(10),
    db
      .select({
        count: sql<number>`count(*)::int`,
        estimated: sql<number>`count(${g.timeToBeatNormally})::int`,
        timeToBeatMin: sql<number>`coalesce(sum(${g.timeToBeatNormally}) / 60, 0)::int`,
      })
      .from(e)
      .innerJoin(g, eq(g.id, e.gameId))
      .where(and(eq(e.userId, userId), inArray(e.status, ["backlog", "wishlist"]))),
    activityHeatmap(userId),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(screenshots)
      .where(eq(screenshots.userId, userId)),
    heatmapYears(userId),
  ]);

  return {
    totals: { ...totals, screenshots: screenshotCount?.count ?? 0 },
    status,
    platform,
    store,
    terms: { genres, themes, modes, perspectives, developers, publishers },
    releaseYears,
    ratings,
    completions,
    topPlayed: topPlayed.map((row) => ({ ...row, coverUrl: gameCoverUrl(row, "cover_small") })),
    backlog: backlog[0] ?? { count: 0, estimated: 0, timeToBeatMin: 0 },
    heatmap,
    heatmapYears: years,
  };
}

/** Site geneli: tüm kullanıcılar birlikte (eski uygulamadaki genel istatistikler). */
export async function globalStats() {
  const [[totals], status, platform, genres, developers, [users]] = await Promise.all([
    db
      .select({
        entries: sql<number>`count(*)::int`,
        games: sql<number>`count(distinct ${e.gameId})::int`,
        completed: sql<number>`count(*) filter (where ${e.status} = 'completed')::int`,
        playtimeMin: sql<number>`coalesce(sum(${playtime}), 0)::bigint::int`,
      })
      .from(e),
    grouped(e.status),
    grouped(e.platform),
    byTerm("genre", ""),
    byTerm("company", "developer"),
    db.select({ count: sql<number>`count(*)::int` }).from(user),
  ]);
  const popular = await db
    .select({
      name: g.name,
      slug: g.slug,
      coverImageId: g.coverImageId,
      coverUrl: g.coverUrl,
      players: sql<number>`count(*)::int`,
      averageRating: sql<number | null>`round(avg(${e.rating}))::int`,
    })
    .from(e)
    .innerJoin(g, eq(g.id, e.gameId))
    .groupBy(g.id)
    .orderBy(desc(sql`count(*)`), desc(sql`avg(${e.rating})`))
    .limit(12);
  return {
    totals: { ...totals, users: users?.count ?? 0 },
    status,
    platform,
    genres,
    developers,
    popular: popular.map((row) => ({ ...row, coverUrl: gameCoverUrl(row, "cover_small") })),
  };
}

function pearson(pairs: Array<[number, number]>) {
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const meanA = pairs.reduce((sum, [a]) => sum + a, 0) / n;
  const meanB = pairs.reduce((sum, [, b]) => sum + b, 0) / n;
  let numerator = 0;
  let varA = 0;
  let varB = 0;
  for (const [a, b] of pairs) {
    numerator += (a - meanA) * (b - meanB);
    varA += (a - meanA) ** 2;
    varB += (b - meanB) ** 2;
  }
  if (varA === 0 || varB === 0) return null;
  return numerator / Math.sqrt(varA * varB);
}

/**
 * İki kullanıcıyı karşılaştırır: ortak oyunlar, puan farkları ve "zevk uyumu". Uyum; ortak oyunlardaki
 * puanların korelasyonu (yön benzerliği) ile ortalama farkın (mutlak yakınlık) ortalamasıdır.
 */
export async function compareUsers(aId: string, bId: string) {
  const rows = await db.execute<{
    game_id: string;
    name: string;
    slug: string;
    cover_image_id: string | null;
    cover_url: string | null;
    a_status: string | null;
    b_status: string | null;
    a_rating: number | null;
    b_rating: number | null;
    a_playtime: number | null;
    b_playtime: number | null;
  }>(sql`
    select g.id as game_id, g.name, g.slug, g.cover_image_id, g.cover_url,
      a.status as a_status, b.status as b_status, a.rating as a_rating, b.rating as b_rating,
      ${aliasedPlaytime("a")} as a_playtime,
      ${aliasedPlaytime("b")} as b_playtime
    from ${g} g
    left join ${e} a on a.game_id = g.id and a.user_id = ${aId}
    left join ${e} b on b.game_id = g.id and b.user_id = ${bId}
    where a.id is not null or b.id is not null
  `);

  const all = rows.rows;
  const shared = all.filter((row) => row.a_status && row.b_status);
  const rated = shared.filter((row) => row.a_rating !== null && row.b_rating !== null) as Array<
    (typeof shared)[number] & { a_rating: number; b_rating: number }
  >;
  const correlation = pearson(rated.map((row) => [row.a_rating, row.b_rating]));
  const meanDiff = rated.length
    ? rated.reduce((sum, row) => sum + Math.abs(row.a_rating - row.b_rating), 0) / rated.length
    : null;
  const closeness = meanDiff === null ? null : Math.max(0, 1 - meanDiff / 40);
  const compatibility =
    correlation === null && closeness === null
      ? null
      : Math.round(
          ((correlation === null ? (closeness ?? 0) : (correlation + 1) / 2) * 0.5 +
            (closeness ?? 0.5) * 0.5) *
            100,
        );

  const present = (row: (typeof all)[number]) => ({
    gameId: row.game_id,
    name: row.name,
    slug: row.slug,
    coverUrl: gameCoverUrl(
      { coverImageId: row.cover_image_id, coverUrl: row.cover_url },
      "cover_small",
    ),
    a: { status: row.a_status, rating: row.a_rating, playtimeMin: row.a_playtime },
    b: { status: row.b_status, rating: row.b_rating, playtimeMin: row.b_playtime },
  });

  return {
    counts: {
      shared: shared.length,
      onlyA: all.filter((row) => row.a_status && !row.b_status).length,
      onlyB: all.filter((row) => row.b_status && !row.a_status).length,
      bothCompleted: shared.filter(
        (row) => row.a_status === "completed" && row.b_status === "completed",
      ).length,
      ratedTogether: rated.length,
    },
    compatibility,
    averageDifference: meanDiff === null ? null : Math.round(meanDiff),
    disagreements: [...rated]
      .sort((x, y) => Math.abs(y.a_rating - y.b_rating) - Math.abs(x.a_rating - x.b_rating))
      .slice(0, 8)
      .map(present),
    agreements: [...rated]
      .filter((row) => row.a_rating >= 80 && row.b_rating >= 80)
      .sort((x, y) => y.a_rating + y.b_rating - (x.a_rating + x.b_rating))
      .slice(0, 8)
      .map(present),
    shared: shared.sort((x, y) => x.name.localeCompare(y.name)).map(present),
  };
}

/**
 * Yıl özeti: bitirilenler, oynama süresi, en çok oynananlar, türler, en yoğun ay. Süreler gerçek oturumlar
 * ile takipten önceki tahminin toplamıdır; tahmin olan kısım `estimatedMinutes` alanlarında ayrıca döner.
 */
export async function wrapped(userId: string, year: number) {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const inYear = sql`${e.finishedAt} >= ${start} and ${e.finishedAt} < ${end}`;
  // Gerçek oturumlar ve tahmini günler tek akışta: gün, oyun, süre, tahmin olan süre.
  const plays = sql`(
    select date_trunc('day', ${playSessions.endedAt})::date as day, ${playSessions.gameId} as game_id,
      ${playSessions.durationMin} as minutes, 0 as estimated
    from ${playSessions}
    where ${playSessions.userId} = ${userId}
      and ${playSessions.endedAt} >= ${start}::date and ${playSessions.endedAt} < ${end}::date
    union all
    select ${playEstimateDays.day}, ${e.gameId}, ${playEstimateDays.minutes}, ${playEstimateDays.minutes}
    from ${playEstimateDays} join ${e} on ${e.id} = ${playEstimateDays.entryId}
    where ${playEstimateDays.userId} = ${userId}
      and ${playEstimateDays.day} >= ${start}::date and ${playEstimateDays.day} < ${end}::date
  ) plays`;
  type GameMinutes = {
    name: string;
    slug: string;
    coverImageId: string | null;
    coverUrl: string | null;
    heroUrl: string | null;
    logoUrl: string | null;
    accentColor: string | null;
    minutes: number;
    estimatedMinutes: number;
  };

  const [finished, [added], totalsResult, topGamesResult, monthsResult, genres] = await Promise.all(
    [
      db
        .select({
          entryId: e.id,
          name: g.name,
          slug: g.slug,
          coverImageId: g.coverImageId,
          coverUrl: g.coverUrl,
          heroUrl: g.heroUrl,
          logoUrl: g.logoUrl,
          accentColor: g.accentColor,
          rating: e.rating,
          finishedAt: e.finishedAt,
          playtimeMin: sql<number>`${playtime}::int`,
        })
        .from(e)
        .innerJoin(g, eq(g.id, e.gameId))
        .where(and(eq(e.userId, userId), eq(e.status, "completed"), inYear))
        .orderBy(desc(sql`coalesce(${e.rating}, -1)`), e.finishedAt),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(e)
        .where(
          and(
            eq(e.userId, userId),
            sql`${e.createdAt} >= ${start}::date and ${e.createdAt} < ${end}::date`,
          ),
        ),
      db.execute<{ minutes: number; estimatedMinutes: number; days: number; games: number }>(sql`
      select coalesce(sum(minutes), 0)::int as minutes, coalesce(sum(estimated), 0)::int as "estimatedMinutes",
        count(distinct day)::int as days, count(distinct game_id)::int as games
      from ${plays}
    `),
      db.execute<GameMinutes>(sql`
      select g.name, g.slug, g.cover_image_id as "coverImageId", g.cover_url as "coverUrl",
        g.hero_url as "heroUrl", g.logo_url as "logoUrl", g.accent_color as "accentColor",
        sum(plays.minutes)::int as minutes, sum(plays.estimated)::int as "estimatedMinutes"
      from ${plays} join ${g} g on g.id = plays.game_id
      group by g.id order by sum(plays.minutes) desc, g.name limit 5
    `),
      db.execute<{ month: number; minutes: number; estimatedMinutes: number }>(sql`
      select extract(month from day)::int as month, sum(minutes)::int as minutes,
        sum(estimated)::int as "estimatedMinutes"
      from ${plays} group by 1 order by 1
    `),
      db
        .select({ key: terms.name, count: sql<number>`count(distinct ${e.id})::int` })
        .from(e)
        .innerJoin(gameTerms, eq(gameTerms.gameId, e.gameId))
        .innerJoin(terms, eq(terms.id, gameTerms.termId))
        .where(
          and(eq(e.userId, userId), eq(terms.kind, "genre"), eq(e.status, "completed"), inYear),
        )
        .groupBy(terms.name)
        .orderBy(desc(sql`count(distinct ${e.id})`))
        .limit(5),
    ],
  );

  const [sessionTotals] = totalsResult.rows;
  const topGames = topGamesResult.rows;
  const months = monthsResult.rows;
  const rated = finished.filter((row) => row.rating !== null);
  const busiest = [...months].sort((a, b) => b.minutes - a.minutes)[0] ?? null;
  return {
    year,
    finishedCount: finished.length,
    averageRating: rated.length
      ? Math.round(rated.reduce((sum, row) => sum + (row.rating ?? 0), 0) / rated.length)
      : null,
    addedCount: added?.count ?? 0,
    playedMinutes: sessionTotals?.minutes ?? 0,
    /** `playedMinutes`'ın takipten önceki tahmin olan kısmı. */
    estimatedMinutes: sessionTotals?.estimatedMinutes ?? 0,
    playedDays: sessionTotals?.days ?? 0,
    playedGames: sessionTotals?.games ?? 0,
    finished: finished.map((row) => ({ ...row, coverUrl: gameCoverUrl(row, "cover_small") })),
    topGames: topGames.map((row) => ({ ...row, coverUrl: gameCoverUrl(row, "cover_small") })),
    months,
    busiestMonth: busiest,
    genres,
  };
}

/** Kullanıcının verisi olan yıllar (Wrapped seçici için). */
export async function wrappedYears(userId: string) {
  const rows = await db.execute<{ year: number }>(sql`
    select distinct extract(year from finished_at)::int as year from ${e} where user_id = ${userId} and finished_at is not null
    union
    select distinct extract(year from ended_at)::int from ${playSessions} where user_id = ${userId}
    union
    select distinct extract(year from day)::int from ${playEstimateDays} where user_id = ${userId}
    order by year desc
  `);
  return rows.rows.map((row) => row.year);
}
