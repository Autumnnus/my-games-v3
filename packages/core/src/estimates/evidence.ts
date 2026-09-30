import { schema } from "@my-games/db";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { entryPlaytime } from "../playtime";
import { dayOf, dayOfDate, isoOf } from "./days";
import { computeWindow, type Evidence } from "./planner";
import { DEFAULT_RHYTHM, type Rhythm } from "./synthesize";

const { libraryEntries: e, games: g } = schema;

/** Aynı gün bu kadar kayıt eklendiyse o gün toplu içe aktarımdır; eklenme günü kanıt sayılmaz. */
const BULK_ADD_COUNT = 5;
/** Aynı dakikada bu kadar başarım: geriye dönük/toplu açılım (oyuna sonradan eklenen başarımlar). */
const ACHIEVEMENT_BURST = 5;
/** Bundan eski tarihler (Steam'in `0` zamanı vb.) kanıt sayılmaz. */
const EVIDENCE_FLOOR = "1995-01-01";

const PLATFORM_FIELDS = [
  ["steam", "playtimeSteamMin"],
  ["psn", "playtimePsnMin"],
  ["xbox", "playtimeXboxMin"],
] as const;

/** Yıllarca oynanan çok oyunculu oyunlar: MMO, battle royale, MOBA ya da tek kişilik modu olmayanlar. */
const ONLINE_MODES = new Set(["Massively Multiplayer Online (MMO)", "Battle Royale"]);
const ONLINE_GENRES = new Set(["MOBA"]);

const iso = (date: Date | null) => (date ? isoOf(dayOfDate(date)) : null);

/**
 * Kullanıcının tüm kayıtları için kanıt paketleri ve oynama ritmi. Bütçe = kaydın görünen toplam süresi −
 * gerçek oturumlar; böylece tahmin + oturumlar her zaman kütüphanedeki toplamı verir. Ufuk (takibin
 * başladığı an) başlığın ilk gözlemi ve ilk gerçek oturumdur; elle girilen süre için kaydın son bilinen
 * tarihidir.
 */
export async function collectEvidence(userId: string, now = new Date()) {
  const [entries, terms, sessions, sessionDays, screenshotDays, achievementMinutes, snapshots] =
    await Promise.all([
      db
        .select({
          entryId: e.id,
          gameId: e.gameId,
          status: e.status,
          startedAt: e.startedAt,
          finishedAt: e.finishedAt,
          lastPlayedAt: e.lastPlayedAt,
          createdAt: e.createdAt,
          totalMin: sql<number>`${entryPlaytime}::int`,
          playtimeSteamMin: e.playtimeSteamMin,
          playtimePsnMin: e.playtimePsnMin,
          playtimeXboxMin: e.playtimeXboxMin,
          name: g.name,
          igdbId: g.igdbId,
          releaseDate: g.releaseDate,
          ttbSeconds: g.timeToBeatNormally,
        })
        .from(e)
        .innerJoin(g, eq(g.id, e.gameId))
        .where(eq(e.userId, userId))
        .orderBy(e.id),
      db.execute<{ game_id: string; kind: string; name: string }>(sql`
        select gt.game_id, t.kind, t.name
        from ${schema.gameTerms} gt join ${schema.terms} t on t.id = gt.term_id
        where t.kind in ('genre', 'game_mode')
          and gt.game_id in (select game_id from ${e} where user_id = ${userId})
        order by t.name
      `),
      db.execute<{ game_id: string; minutes: number; first_started_at: Date }>(sql`
        select game_id, sum(duration_min)::int as minutes, min(started_at) as first_started_at
        from ${schema.playSessions} where user_id = ${userId} group by game_id
      `),
      db.execute<{ day: string; minutes: number }>(sql`
        select to_char(ended_at at time zone 'UTC', 'YYYY-MM-DD') as day, sum(duration_min)::int as minutes
        from ${schema.playSessions} where user_id = ${userId} group by 1
      `),
      db.execute<{ game_id: string; day: string; count: number }>(sql`
        select game_id, to_char(taken_at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*)::int as count
        from ${schema.screenshots}
        where user_id = ${userId} and taken_at >= ${EVIDENCE_FLOOR}::date
        group by 1, 2 order by 2
      `),
      db.execute<{ game_id: string; day: string; count: number }>(sql`
        select s.game_id, to_char(ua.unlocked_at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*)::int as count
        from ${schema.userAchievements} ua
        join ${schema.achievementSets} s on s.provider = ua.provider and s.game_key = ua.game_key
        where ua.user_id = ${userId} and s.game_id is not null and ua.unlocked_at >= ${EVIDENCE_FLOOR}::date
        group by s.game_id, 2, date_trunc('minute', ua.unlocked_at) order by 2
      `),
      db.execute<{
        provider: string;
        game_id: string | null;
        baseline_at: Date | null;
        baseline_last_played_at: Date | null;
      }>(sql`
        select ps.provider, coalesce(steam_game.id, external.game_id) as game_id,
          ps.baseline_at, ps.baseline_last_played_at
        from ${schema.platformSnapshots} ps
        left join ${g} steam_game
          on ps.provider = 'steam' and steam_game.steam_app_id::text = ps.external_id
        left join ${schema.gameExternalIds} external
          on external.provider = ps.provider and external.external_id = ps.external_id
        where ps.user_id = ${userId} and ps.baseline_at is not null
      `),
    ]);

  const genres = new Map<string, string[]>();
  const modes = new Map<string, Set<string>>();
  for (const row of terms.rows) {
    if (row.kind === "genre")
      genres.set(row.game_id, [...(genres.get(row.game_id) ?? []), row.name]);
    else modes.set(row.game_id, (modes.get(row.game_id) ?? new Set()).add(row.name));
  }
  const multiplayer = new Set<string>();
  for (const gameId of new Set([...genres.keys(), ...modes.keys()])) {
    const gameModes = modes.get(gameId) ?? new Set<string>();
    if (
      [...gameModes].some((mode) => ONLINE_MODES.has(mode)) ||
      (genres.get(gameId) ?? []).some((genre) => ONLINE_GENRES.has(genre)) ||
      (gameModes.has("Multiplayer") && !gameModes.has("Single player"))
    ) {
      multiplayer.add(gameId);
    }
  }
  const sessionsByGame = new Map(sessions.rows.map((row) => [row.game_id, row]));
  const screenshotsByGame = groupDays(screenshotDays.rows, (count) => count);
  // Toplu açılımlar (aynı dakikada çok başarım) tek ve zayıf bir kanıttır.
  const achievementsByGame = groupDays(achievementMinutes.rows, (count) =>
    count >= ACHIEVEMENT_BURST ? 0.3 : count,
  );

  // Başlık bazında ufuk; başlığı bir oyuna bağlanamayan gözlemler için platformun ilk gözlemi.
  const baselineByGame = new Map<string, { at: Date; lastPlayedAt: Date | null }>();
  const providerStart = new Map<string, Date>();
  for (const row of snapshots.rows) {
    if (!row.baseline_at) continue;
    const at = new Date(row.baseline_at);
    const start = providerStart.get(row.provider);
    if (!start || at < start) providerStart.set(row.provider, at);
    if (!row.game_id) continue;
    const current = baselineByGame.get(row.game_id);
    if (!current || at < current.at) {
      baselineByGame.set(row.game_id, {
        at,
        lastPlayedAt: row.baseline_last_played_at ? new Date(row.baseline_last_played_at) : null,
      });
    }
  }

  const addedPerDay = new Map<string, number>();
  for (const entry of entries) {
    const day = iso(entry.createdAt) ?? "";
    addedPerDay.set(day, (addedPerDay.get(day) ?? 0) + 1);
  }

  const evidence: Evidence[] = [];
  for (const entry of entries) {
    const played = sessionsByGame.get(entry.gameId);
    const budgetMin = Math.max(0, entry.totalMin - (played?.minutes ?? 0));
    if (budgetMin <= 0) continue;

    const baseline = baselineByGame.get(entry.gameId);
    // Takibin başladığı an: başlığın ilk gözlemi (yoksa platformun), ilk gerçek oturum.
    const tracked: Date[] = [];
    if (baseline) tracked.push(baseline.at);
    else {
      for (const [provider, field] of PLATFORM_FIELDS) {
        const start = providerStart.get(provider);
        if (entry[field] !== null && start) tracked.push(start);
      }
    }
    if (played) tracked.push(new Date(played.first_started_at));
    const candidates = [...tracked];
    if (candidates.length === 0) {
      // Yalnızca elle/eski sistemden gelen süre: kaydın bilinen son tarihine kadar oynanmıştır.
      const known = [
        entry.createdAt,
        entry.lastPlayedAt,
        entry.finishedAt ? new Date(`${entry.finishedAt}T12:00:00Z`) : null,
      ]
        .filter((date): date is Date => date !== null)
        .map((date) => date.getTime());
      candidates.push(new Date(Math.min(now.getTime(), Math.max(...known) + 86_400_000)));
    }
    const horizon = new Date(Math.min(...candidates.map((date) => date.getTime())));
    const horizonDay = dayOfDate(horizon);
    const before = (day: string | null) => (day && dayOf(day) < horizonDay ? day : null);

    const lastPlayedAt = before(iso(baseline?.lastPlayedAt ?? null) ?? iso(entry.lastPlayedAt));
    const startedAt = before(entry.startedAt);
    const finishedAt = before(entry.finishedAt);
    const createdDay = iso(entry.createdAt);
    const addedAt =
      createdDay && (addedPerDay.get(createdDay) ?? 0) < BULK_ADD_COUNT ? before(createdDay) : null;
    const screenshots = (screenshotsByGame.get(entry.gameId) ?? []).filter(([day]) => before(day));
    const achievements = (achievementsByGame.get(entry.gameId) ?? []).filter(([day]) =>
      before(day),
    );

    const window = computeWindow({
      horizonDay,
      releaseDate: entry.releaseDate,
      startedAt,
      lastPlayedAt,
      evidenceDays: [...screenshots, ...achievements]
        .map(([day]) => dayOf(day))
        .concat([finishedAt, addedAt].filter((day): day is string => day !== null).map(dayOf)),
    });
    const inWindow = (day: string | null) =>
      day && dayOf(day) >= window.from && dayOf(day) <= window.to ? day : null;

    evidence.push({
      entryId: entry.entryId,
      name: entry.name,
      budgetMin,
      window: { from: isoOf(window.from), to: isoOf(window.to) },
      trackedFrom: tracked.length > 0 ? isoOf(horizonDay) : null,
      status: entry.status,
      releaseDate: entry.releaseDate,
      startedAt: inWindow(startedAt),
      finishedAt: inWindow(finishedAt),
      lastPlayedAt: inWindow(lastPlayedAt),
      addedAt: inWindow(addedAt),
      ttbMin: entry.ttbSeconds ? Math.round(entry.ttbSeconds / 60) : null,
      genres: genres.get(entry.gameId) ?? [],
      multiplayer: multiplayer.has(entry.gameId),
      catalogued: entry.igdbId !== null || entry.releaseDate !== null || genres.has(entry.gameId),
      achievements: achievements.filter(([day]) => inWindow(day)),
      screenshots: screenshots.filter(([day]) => inWindow(day)),
    });
  }

  return { evidence, rhythm: rhythmOf(sessionDays.rows) };
}

/** Oyun × gün satırlarını oyun başına `[gün, değer]` listesine çevirir (aynı gün toplanır). */
function groupDays(
  rows: ReadonlyArray<{ game_id: string; day: string; count: number }>,
  value: (count: number) => number,
) {
  const byGame = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const days = byGame.get(row.game_id) ?? new Map<string, number>();
    days.set(row.day, (days.get(row.day) ?? 0) + value(row.count));
    byGame.set(row.game_id, days);
  }
  return new Map(
    [...byGame].map(([gameId, days]) => [
      gameId,
      [...days].map(([day, total]): [string, number] => [day, Math.round(total * 100) / 100]),
    ]),
  );
}

/**
 * Gerçek oturumlardan haftalık ritim ve günlük tavan. Veri azsa varsayılan; varsa varsayılanla yarı yarıya
 * karıştırılır ve yuvarlanır (her sync'te küçük oynamalar tüm geçmişi yeniden yazdırmasın).
 */
export function rhythmOf(days: ReadonlyArray<{ day: string; minutes: number }>): Rhythm {
  if (days.length < 14) return DEFAULT_RHYTHM;
  const byWeekday = new Array<number>(7).fill(0);
  for (const row of days) {
    const weekday = new Date(`${row.day}T00:00:00Z`).getUTCDay();
    byWeekday[weekday] = (byWeekday[weekday] ?? 0) + row.minutes;
  }
  const total = byWeekday.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return DEFAULT_RHYTHM;
  const weekday = byWeekday.map((value, index) => {
    const observed = (value / total) * 7;
    const blended = 0.5 * observed + 0.5 * (DEFAULT_RHYTHM.weekday[index] ?? 1);
    return Math.round(Math.min(2, Math.max(0.3, blended)) * 20) / 20;
  });
  const sorted = days.map((row) => row.minutes).sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  const dailyCapMin = Math.min(840, Math.max(360, Math.round((p95 * 1.25) / 60) * 60));
  return { weekday, dailyCapMin };
}
