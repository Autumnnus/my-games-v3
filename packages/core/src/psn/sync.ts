import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import {
  type AuthorizationPayload,
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens,
  getProfileFromAccountId,
  getProfileFromUserName,
  getTitleTrophies,
  getUserPlayedGames,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  type TrophyTitle,
} from "psn-api";
import { type AchievementDef, getAchievementSet, isSetStale } from "../achievements";
import { ensurePlatformGame, findGameByExternalId, linkExternalId } from "../catalog";
import { psnEnabled } from "../config";
import { db } from "../db";
import { AppError } from "../errors";
import {
  getPlatformAccount,
  markNeedsReauth,
  type PlatformAccount,
  PlatformReauthError,
  readCredentials,
  recordPlatformSync,
  savePlatformAccount,
  updateCredentials,
} from "../platforms/accounts";
import {
  type AchievementFetch,
  applyPlatformTitles,
  type EngineEntry,
  loadEngineEntries,
  type PlatformTitle,
} from "../platforms/engine";
import { titleSimilarity } from "../text";

const { syncRuns } = schema;

type PsnCredentials = { accessToken: string; accessExpiresAt: number; refreshToken: string };

const NAME_MATCH_SCORE = 0.92;
const TROPHY_TITLE_MATCH_SCORE = 0.9;
const MAX_ACHIEVEMENT_CHECKS = 40;
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

function ensureEnabled() {
  if (!psnEnabled()) throw new AppError("unavailable", "PlayStation bağlantısı kapalı");
}

function isTokens(value: { accessToken?: string; refreshToken?: string }) {
  return typeof value.accessToken === "string" && typeof value.refreshToken === "string";
}

/**
 * PSN hesabını NPSSO koduyla bağlar. NPSSO (Sony oturum çerezi) saklanmaz: hemen token'a çevrilir,
 * yalnızca yenileme token'ı şifreli tutulur (~2 ay geçerli; sonra kullanıcıdan yeniden bağlaması istenir).
 */
export async function linkPsnAccount(userId: string, npsso: string) {
  ensureEnabled();
  const code = npsso.trim();
  // NPSSO 64 karakterlik bir çerez değeridir; biçimi Sony değiştirebileceği için gevşek kontrol edilir.
  if (!/^[\w-]{32,256}$/.test(code)) throw new AppError("invalid", "NPSSO kodu geçersiz");
  let tokens: Awaited<ReturnType<typeof exchangeAccessCodeForAuthTokens>>;
  try {
    tokens = await exchangeAccessCodeForAuthTokens(await exchangeNpssoForAccessCode(code));
  } catch {
    throw new AppError("invalid", "NPSSO kodu geçersiz ya da süresi dolmuş");
  }
  if (!isTokens(tokens)) throw new AppError("invalid", "NPSSO kodu geçersiz ya da süresi dolmuş");

  const auth: AuthorizationPayload = { accessToken: tokens.accessToken };
  const me = await getProfileFromAccountId(auth, "me");
  if (!me?.onlineId) throw new AppError("unavailable", "PSN profili okunamadı");
  const legacy = await getProfileFromUserName(auth, me.onlineId);
  const accountId = legacy?.profile?.accountId;
  if (!accountId) throw new AppError("unavailable", "PSN hesap kimliği okunamadı");

  const now = Date.now();
  await savePlatformAccount({
    userId,
    provider: "psn",
    externalId: accountId,
    displayName: me.onlineId,
    avatarUrl:
      me.avatars?.find((avatar) => avatar.size === "xl")?.url ?? me.avatars?.[0]?.url ?? null,
    credentials: {
      accessToken: tokens.accessToken,
      accessExpiresAt: now + tokens.expiresIn * 1000,
      refreshToken: tokens.refreshToken,
    } satisfies PsnCredentials,
    credentialsExpireAt: new Date(now + tokens.refreshTokenExpiresIn * 1000),
  });
}

/** Geçerli bir erişim token'ı döner; gerekirse yeniler. Yenileme reddedilirse hesap "yeniden bağla"ya düşer. */
async function authorize(account: PlatformAccount): Promise<AuthorizationPayload> {
  const credentials = readCredentials<PsnCredentials>(account);
  if (credentials.accessExpiresAt - Date.now() > 60_000) {
    return { accessToken: credentials.accessToken };
  }
  const refreshed = await exchangeRefreshTokenForAuthTokens(credentials.refreshToken).catch(
    () => null,
  );
  if (!refreshed || !isTokens(refreshed)) {
    await markNeedsReauth(account);
    throw new PlatformReauthError("psn");
  }
  const now = Date.now();
  await updateCredentials(
    account,
    {
      accessToken: refreshed.accessToken,
      accessExpiresAt: now + refreshed.expiresIn * 1000,
      refreshToken: refreshed.refreshToken,
    } satisfies PsnCredentials,
    new Date(now + refreshed.refreshTokenExpiresIn * 1000),
  );
  return { accessToken: refreshed.accessToken };
}

/** ISO 8601 süresini dakikaya çevirir (`PT228H56M33S` → 13736). */
export function parsePsnDuration(value: string | undefined | null) {
  const match = value?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return Math.floor(total / 60);
}

function cleanName(name: string) {
  return name.replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
}

function trophyCount(counts: TrophyTitle["earnedTrophies"] | undefined) {
  if (!counts) return 0;
  return counts.bronze + counts.silver + counts.gold + counts.platinum;
}

type TrophyInfo = { npId: string; service: "trophy" | "trophy2"; total: number };

async function loadPlayedGames(auth: AuthorizationPayload) {
  const titles: Awaited<ReturnType<typeof getUserPlayedGames>>["titles"] = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const page = await getUserPlayedGames(auth, "me", { limit: 200, offset });
    if (!Array.isArray(page?.titles)) {
      if (offset === 0) throw new AppError("unavailable", "PSN oyun listesi okunamadı (gizlilik?)");
      break;
    }
    titles.push(...page.titles);
    if (page.titles.length < 200 || titles.length >= (page.totalItemCount ?? 0)) break;
  }
  return titles;
}

async function loadTrophyTitles(auth: AuthorizationPayload) {
  const titles: TrophyTitle[] = [];
  for (let offset = 0; offset < 4000; offset += 800) {
    const page = await getUserTitles(auth, "me", { limit: 800, offset });
    if (!Array.isArray(page?.trophyTitles)) break;
    titles.push(...page.trophyTitles);
    if (page.trophyTitles.length < 800 || titles.length >= (page.totalItemCount ?? 0)) break;
  }
  return titles;
}

/**
 * PSN "oynanan oyunlar" (PS4/PS5, süreyle) ve kupa listesini (PS3/Vita dahil) tek başlık listesine çevirir.
 * Oynanan oyun kimliği `concept:<id>` (PS4/PS5 sürümleri aynı konsepttir), yalnızca kupa listesinde olanlar
 * `np:<npCommunicationId>`.
 */
export function buildPsnTitles(
  played: Awaited<ReturnType<typeof getUserPlayedGames>>["titles"],
  trophies: TrophyTitle[],
  now = new Date(),
) {
  const trophyInfo = new Map<string, TrophyInfo>();
  const unmatched = new Set(trophies);
  const titles: PlatformTitle[] = [];
  const byExternalId = new Map<string, PlatformTitle>();

  for (const game of played) {
    const externalId = game.concept?.id ? `concept:${game.concept.id}` : `title:${game.titleId}`;
    const name = cleanName(game.localizedName || game.name || game.concept?.name || game.titleId);
    const lastPlayedAt = game.lastPlayedDateTime ? new Date(game.lastPlayedDateTime) : null;
    const minutes = parsePsnDuration(game.playDuration);
    const existing = byExternalId.get(externalId);
    if (existing) {
      // Aynı konseptin iki sürümü (ör. PS4 + PS5): süreler toplanır, son oynama en yenisi.
      existing.playtimeMin = (existing.playtimeMin ?? 0) + (minutes ?? 0);
      if (lastPlayedAt && (!existing.lastPlayedAt || lastPlayedAt > existing.lastPlayedAt)) {
        existing.lastPlayedAt = lastPlayedAt;
        existing.recentlyPlayed = now.getTime() - lastPlayedAt.getTime() < RECENT_MS;
      }
      continue;
    }
    const best = [...unmatched]
      .map((trophy) => ({
        trophy,
        score: titleSimilarity(cleanName(trophy.trophyTitleName), name),
      }))
      .sort((a, b) => b.score - a.score)[0];
    const trophy = best && best.score >= TROPHY_TITLE_MATCH_SCORE ? best.trophy : null;
    if (trophy) {
      unmatched.delete(trophy);
      trophyInfo.set(externalId, {
        npId: trophy.npCommunicationId,
        service: trophy.npServiceName,
        total: trophyCount(trophy.definedTrophies),
      });
    }
    const title: PlatformTitle = {
      externalId,
      name,
      playtimeMin: minutes,
      lastPlayedAt,
      recentlyPlayed: !!lastPlayedAt && now.getTime() - lastPlayedAt.getTime() < RECENT_MS,
      hasAchievements: !!trophy,
      achievementsUnlocked: trophy ? trophyCount(trophy.earnedTrophies) : null,
      imageUrl: game.imageUrl || game.localizedImageUrl || null,
    };
    titles.push(title);
    byExternalId.set(externalId, title);
  }

  // Süresi bilinmeyen (PS3/Vita ya da oynanan listesinde olmayan) ama kupası olan oyunlar.
  for (const trophy of unmatched) {
    const externalId = `np:${trophy.npCommunicationId}`;
    const lastPlayedAt = trophy.lastUpdatedDateTime ? new Date(trophy.lastUpdatedDateTime) : null;
    trophyInfo.set(externalId, {
      npId: trophy.npCommunicationId,
      service: trophy.npServiceName,
      total: trophyCount(trophy.definedTrophies),
    });
    titles.push({
      externalId,
      name: cleanName(trophy.trophyTitleName),
      playtimeMin: null,
      lastPlayedAt,
      recentlyPlayed: false,
      hasAchievements: true,
      achievementsUnlocked: trophyCount(trophy.earnedTrophies),
      imageUrl: trophy.trophyTitleIconUrl || null,
    });
  }
  return { titles, trophyInfo };
}

async function trophyDefs(
  auth: AuthorizationPayload,
  info: TrophyInfo,
  rarity: Map<string, number>,
): Promise<AchievementDef[]> {
  const options = { npServiceName: info.service };
  const [english, turkish] = await Promise.all([
    getTitleTrophies(auth, info.npId, "all", {
      ...options,
      headerOverrides: { "Accept-Language": "en-US" },
    }),
    getTitleTrophies(auth, info.npId, "all", {
      ...options,
      headerOverrides: { "Accept-Language": "tr-TR" },
    }).catch(() => null),
  ]);
  if (!Array.isArray(english?.trophies)) return [];
  const turkishById = new Map((turkish?.trophies ?? []).map((row) => [row.trophyId, row]));
  return english.trophies.map((row) => {
    const tr = turkishById.get(row.trophyId);
    const localized =
      tr?.trophyName && tr.trophyName !== row.trophyName
        ? { tr: { name: tr.trophyName, description: tr.trophyDetail ?? null } }
        : null;
    return {
      apiName: String(row.trophyId),
      name: row.trophyName ?? `#${row.trophyId}`,
      description: row.trophyDetail ?? null,
      localized,
      iconUrl: row.trophyIconUrl ?? null,
      hidden: row.trophyHidden === true,
      rarity: rarity.get(String(row.trophyId)) ?? null,
      grade: row.trophyType,
    };
  });
}

async function fetchTrophies(
  auth: AuthorizationPayload,
  info: TrophyInfo | undefined,
): Promise<AchievementFetch | null> {
  if (!info) return null;
  const earned = await getUserTrophiesEarnedForTitle(auth, "me", info.npId, "all", {
    npServiceName: info.service,
  });
  if (!Array.isArray(earned?.trophies)) return null;
  const rarity = new Map(
    earned.trophies
      .filter((row) => row.trophyEarnedRate !== undefined)
      .map((row) => [String(row.trophyId), Number(row.trophyEarnedRate)]),
  );
  const set = await getAchievementSet(db, "psn", info.npId);
  const defs = isSetStale(set, earned.trophies.length)
    ? await trophyDefs(auth, info, rarity)
    : null;
  return {
    gameKey: info.npId,
    defs,
    total: earned.trophies.length,
    unlocked: earned.trophies
      .filter((row) => row.earned)
      .map((row) => ({
        apiName: String(row.trophyId),
        unlockedAt: row.earnedDateTime ? new Date(row.earnedDateTime) : null,
      })),
  };
}

/** Kullanıcının PSN oyunlarını, sürelerini ve kupalarını senkronize eder. */
export async function syncPsnUser(userId: string) {
  const account = await getPlatformAccount(userId, "psn");
  if (!account?.syncEnabled || account.needsReauth || !psnEnabled())
    return { skipped: true as const };
  const [run] = await db
    .insert(syncRuns)
    .values({ userId, source: "psn" })
    .returning({ id: syncRuns.id });
  const now = new Date();
  try {
    const auth = await authorize(account);
    const [played, trophies] = await Promise.all([loadPlayedGames(auth), loadTrophyTitles(auth)]);
    const { titles, trophyInfo } = buildPsnTitles(played, trophies, now);

    const entries = await loadEngineEntries(userId);
    const byGame = new Map(entries.map((entry) => [entry.gameId, entry]));
    const findEntry = async (title: PlatformTitle): Promise<EngineEntry | undefined> => {
      const mapped = await findGameByExternalId(db, "psn", title.externalId);
      if (mapped) return byGame.get(mapped.id);
      // Kütüphanede aynı adlı oyun varsa (Steam'den, eski veriden…) PSN başlığı ona bağlanır.
      const best = entries
        .map((entry) => ({ entry, score: titleSimilarity(entry.name, title.name) }))
        .sort((a, b) => b.score - a.score)[0];
      if (!best || best.score < NAME_MATCH_SCORE) return undefined;
      await linkExternalId(db, "psn", title.externalId, best.entry.gameId);
      return best.entry;
    };

    const result = await applyPlatformTitles({
      userId,
      titles,
      lastSyncedAt: account.lastSyncedAt,
      now,
      spec: {
        provider: "psn",
        playtimeField: "playtimePsnMin",
        sessionSource: "psn_delta",
        newEntry: { store: "playstation", platform: "playstation" },
        maxAchievementChecks: MAX_ACHIEVEMENT_CHECKS,
        findEntry,
        ensureGame: (title) =>
          ensurePlatformGame("psn", title.externalId, title.name, title.imageUrl ?? null),
        fetchAchievements: (title) => fetchTrophies(auth, trophyInfo.get(title.externalId)),
      },
    });
    await recordPlatformSync(account, { ok: true, at: now });
    if (run) {
      await db
        .update(syncRuns)
        .set({ finishedAt: new Date(), ok: true, stats: result.stats })
        .where(eq(syncRuns.id, run.id));
    }
    return { skipped: false as const, ...result };
  } catch (error) {
    const message =
      error instanceof PlatformReauthError
        ? "reauth"
        : error instanceof Error
          ? error.message
          : String(error);
    if (!(error instanceof PlatformReauthError)) {
      await recordPlatformSync(account, { ok: false, error: message });
    }
    if (run) {
      await db
        .update(syncRuns)
        .set({ finishedAt: new Date(), ok: false, error: message })
        .where(eq(syncRuns.id, run.id));
    }
    if (error instanceof PlatformReauthError) return { skipped: false as const, error: message };
    throw error;
  }
}
