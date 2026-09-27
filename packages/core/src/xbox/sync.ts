import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { type AchievementDef, getAchievementSet, isSetStale } from "../achievements";
import { ensurePlatformGame, findGameByExternalId, linkExternalId } from "../catalog";
import { xboxConfig } from "../config";
import { db } from "../db";
import { AppError } from "../errors";
import { getPlatformAccount, PlatformReauthError, recordPlatformSync } from "../platforms/accounts";
import {
  type AchievementFetch,
  applyPlatformTitles,
  type EngineEntry,
  loadEngineEntries,
  type PlatformTitle,
} from "../platforms/engine";
import { titleSimilarity } from "../text";
import { authorizationHeader, forgetXsts, type XboxAuth, xboxAuthorize } from "./auth";

const { syncRuns } = schema;

const NAME_MATCH_SCORE = 0.92;
const MAX_ACHIEVEMENT_CHECKS = 40;
const STATS_BATCH = 50;
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

type XboxTitle = {
  titleId: string;
  name: string;
  type?: string;
  devices?: string[];
  displayImage?: string;
  achievement?: { currentAchievements?: number; totalAchievements?: number };
  titleHistory?: { lastTimePlayed?: string };
};

type XboxAchievement = {
  id: string;
  name: string;
  progressState?: string;
  progression?: { timeUnlocked?: string };
  mediaAssets?: Array<{ type?: string; url?: string }>;
  isSecret?: boolean;
  description?: string;
  lockedDescription?: string;
  rarity?: { currentPercentage?: number };
  rewards?: Array<{ type?: string; value?: string }>;
};

/** API token'ı reddetti: önbellekteki XSTS silinir, sonraki sync yeniler (bağlantı bozulmaz). */
class XboxTokenRejected extends AppError {
  constructor() {
    super("unavailable", "Xbox oturumu reddedildi, sonraki senkronizasyonda yenilenecek");
  }
}

async function xbl<T>(
  auth: XboxAuth,
  url: string,
  init: { method?: string; body?: unknown; contract: string; language?: string },
) {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: authorizationHeader(auth),
      "x-xbl-contract-version": init.contract,
      "Accept-Language": init.language ?? "en-US",
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (response.status === 401) throw new XboxTokenRejected();
  if (!response.ok)
    throw new AppError("unavailable", `Xbox ${new URL(url).host} ${response.status}`);
  return (await response.json()) as T;
}

async function titleHistory(auth: XboxAuth) {
  const body = await xbl<{ titles?: XboxTitle[] }>(
    auth,
    `https://titlehub.xboxlive.com/users/xuid(${auth.xuid})/titles/titlehistory/decoration/achievement,image?maxItems=1000`,
    { contract: "2" },
  );
  return (body.titles ?? []).filter((title) => (title.type ?? "Game") === "Game");
}

/** Başlık başına oynama süresi (dakika). Bildirmeyen başlıklar haritada yer almaz. */
async function minutesPlayed(auth: XboxAuth, titleIds: string[]) {
  const minutes = new Map<string, number>();
  for (let index = 0; index < titleIds.length; index += STATS_BATCH) {
    const chunk = titleIds.slice(index, index + STATS_BATCH);
    const body = await xbl<{
      statlistscollection?: Array<{ stats?: Array<{ titleid?: string; value?: string }> }>;
    }>(auth, "https://userstats.xboxlive.com/batch", {
      method: "POST",
      contract: "2",
      body: {
        arrangebyfield: "xuid",
        xuids: [auth.xuid],
        stats: chunk.map((titleId) => ({ name: "MinutesPlayed", titleid: titleId })),
      },
    }).catch(() => null);
    const stats = body?.statlistscollection?.[0]?.stats ?? [];
    stats.forEach((stat, position) => {
      const titleId = stat.titleid ?? chunk[position];
      const value = Number(stat.value);
      if (titleId && stat.value !== undefined && Number.isFinite(value)) {
        minutes.set(String(titleId), Math.round(value));
      }
    });
  }
  return minutes;
}

function toDefs(list: XboxAchievement[], localized?: XboxAchievement[]): AchievementDef[] {
  const turkish = new Map((localized ?? []).map((row) => [row.id, row]));
  return list.map((row) => {
    const tr = turkish.get(row.id);
    const gamerscore = row.rewards?.find((reward) => reward.type === "Gamerscore")?.value;
    return {
      apiName: row.id,
      name: row.name,
      description: row.description || row.lockedDescription || null,
      localized:
        tr && tr.name !== row.name
          ? { tr: { name: tr.name, description: tr.description || tr.lockedDescription || null } }
          : null,
      iconUrl: row.mediaAssets?.find((asset) => asset.type === "Icon")?.url ?? null,
      hidden: row.isSecret === true,
      rarity: row.rarity?.currentPercentage ?? null,
      grade: gamerscore ?? null,
    };
  });
}

async function fetchAchievements(
  auth: XboxAuth,
  title: PlatformTitle,
): Promise<AchievementFetch | null> {
  const url = `https://achievements.xboxlive.com/users/xuid(${auth.xuid})/achievements?titleId=${encodeURIComponent(title.externalId)}&maxItems=1000`;
  const body = await xbl<{ achievements?: XboxAchievement[] }>(auth, url, { contract: "2" });
  const list = body.achievements ?? [];
  if (list.length === 0) return null;
  const set = await getAchievementSet(db, "xbox", title.externalId);
  let defs: AchievementDef[] | null = null;
  if (isSetStale(set, list.length)) {
    const turkish = await xbl<{ achievements?: XboxAchievement[] }>(auth, url, {
      contract: "2",
      language: "tr-TR",
    }).catch(() => null);
    defs = toDefs(list, turkish?.achievements);
  }
  return {
    gameKey: title.externalId,
    defs,
    total: list.length,
    unlocked: list
      .filter((row) => row.progressState === "Achieved")
      .map((row) => {
        const at = row.progression?.timeUnlocked ? new Date(row.progression.timeUnlocked) : null;
        // Xbox bilinmeyen zaman için 0001-01-01 döndürür.
        return { apiName: row.id, unlockedAt: at && at.getFullYear() > 2000 ? at : null };
      }),
  };
}

export function buildXboxTitles(
  titles: XboxTitle[],
  minutes: Map<string, number>,
  now = new Date(),
) {
  return titles.map((title): PlatformTitle => {
    const lastPlayedAt = title.titleHistory?.lastTimePlayed
      ? new Date(title.titleHistory.lastTimePlayed)
      : null;
    const total = title.achievement?.totalAchievements ?? 0;
    return {
      externalId: String(title.titleId),
      name: title.name.replace(/[™®©]/g, "").trim(),
      playtimeMin: minutes.get(String(title.titleId)) ?? null,
      lastPlayedAt,
      recentlyPlayed: !!lastPlayedAt && now.getTime() - lastPlayedAt.getTime() < RECENT_MS,
      // Xbox 360 başarımları farklı bir API'de; yalnızca sayıları alınır.
      hasAchievements: total > 0 && !(title.devices ?? []).every((device) => device === "Xbox360"),
      achievementsUnlocked: total > 0 ? (title.achievement?.currentAchievements ?? 0) : null,
      imageUrl: title.displayImage ?? null,
    };
  });
}

/** Kullanıcının Xbox (konsol + PC Game Pass) oyunlarını, sürelerini ve başarımlarını senkronize eder. */
export async function syncXboxUser(userId: string) {
  const account = await getPlatformAccount(userId, "xbox");
  if (!account?.syncEnabled || account.needsReauth || !xboxConfig()) {
    return { skipped: true as const };
  }
  const [run] = await db
    .insert(syncRuns)
    .values({ userId, source: "xbox" })
    .returning({ id: syncRuns.id });
  const now = new Date();
  try {
    const auth = await xboxAuthorize(account);
    const history = await titleHistory(auth);
    const minutes = await minutesPlayed(
      auth,
      history.map((title) => String(title.titleId)),
    );
    const titles = buildXboxTitles(history, minutes, now);

    const entries = await loadEngineEntries(userId);
    const byGame = new Map(entries.map((entry) => [entry.gameId, entry]));
    const findEntry = async (title: PlatformTitle): Promise<EngineEntry | undefined> => {
      const mapped = await findGameByExternalId(db, "xbox", title.externalId);
      if (mapped) return byGame.get(mapped.id);
      const best = entries
        .map((entry) => ({ entry, score: titleSimilarity(entry.name, title.name) }))
        .sort((a, b) => b.score - a.score)[0];
      if (!best || best.score < NAME_MATCH_SCORE) return undefined;
      await linkExternalId(db, "xbox", title.externalId, best.entry.gameId);
      return best.entry;
    };

    const result = await applyPlatformTitles({
      userId,
      titles,
      lastSyncedAt: account.lastSyncedAt,
      now,
      spec: {
        provider: "xbox",
        playtimeField: "playtimeXboxMin",
        sessionSource: "xbox_delta",
        newEntry: { store: "xbox", platform: "xbox" },
        maxAchievementChecks: MAX_ACHIEVEMENT_CHECKS,
        findEntry,
        ensureGame: (title) =>
          ensurePlatformGame("xbox", title.externalId, title.name, title.imageUrl ?? null),
        fetchAchievements: (title) => fetchAchievements(auth, title),
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
    const reauth = error instanceof PlatformReauthError;
    const message = reauth ? "reauth" : error instanceof Error ? error.message : String(error);
    if (error instanceof XboxTokenRejected) await forgetXsts(account);
    // Yeniden bağlama gerekiyorsa `xboxAuthorize` hesabı zaten işaretledi.
    if (!reauth) await recordPlatformSync(account, { ok: false, error: message });
    if (run) {
      await db
        .update(syncRuns)
        .set({ finishedAt: new Date(), ok: false, error: message })
        .where(eq(syncRuns.id, run.id));
    }
    if (reauth) return { skipped: false as const, error: message };
    throw error;
  }
}
