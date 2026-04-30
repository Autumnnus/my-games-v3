import wishlistRepository from "../repository/wishlist.repository";
import igdbRepository from "../repository/igdb.repository";
import axios from "axios";

interface SteamWishlistApiItem {
  appid: number;
  priority: number;
  date_added: number;
}

interface SteamAppDetail {
  success: boolean;
  data?: { name: string; header_image?: string };
}

interface IgdbExternalGame {
  game: number;
  uid: string;
}

interface IgdbGameData {
  id: number;
  name?: string;
  cover?: { url: string };
  genres?: { name: string }[];
  first_release_date?: number;
  involved_companies?: { developer: boolean; company: { name: string } }[];
}

const log = (msg: string) => console.log(`[steam-import] ${msg}`);

// ─── Steam appdetails ─────────────────────────────────────────────────────────

interface SteamDetail {
  name?: string;
  headerImage?: string;
}

async function fetchSteamDetailsSingle(appId: number): Promise<SteamDetail | null> {
  try {
    const res = await axios.get<Record<string, SteamAppDetail>>(
      "https://store.steampowered.com/api/appdetails",
      { params: { appids: String(appId) }, timeout: 8000 }
    );
    const detail = res.data[String(appId)];
    if (detail?.success && detail.data) {
      return { name: detail.data.name, headerImage: detail.data.header_image };
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchSteamDetailsChunk(appIds: number[]): Promise<Map<number, SteamDetail>> {
  const result = new Map<number, SteamDetail>();
  try {
    const res = await axios.get<Record<string, SteamAppDetail>>(
      "https://store.steampowered.com/api/appdetails",
      { params: { appids: appIds.join(",") }, timeout: 12000 }
    );
    for (const [id, detail] of Object.entries(res.data)) {
      if (detail?.success && detail.data) {
        result.set(Number(id), { name: detail.data.name, headerImage: detail.data.header_image });
      }
    }
  } catch {
    // chunk failed — callers will retry individually
  }
  return result;
}

/**
 * Fetch name + header_image from Steam Store API.
 * Tries chunks of 10 first; if a chunk fails, retries each app individually.
 */
async function fetchSteamDetails(appIds: number[]): Promise<Map<number, SteamDetail>> {
  const result = new Map<number, SteamDetail>();
  if (appIds.length === 0) return result;

  const CHUNK = 10;
  for (let i = 0; i < appIds.length; i += CHUNK) {
    const chunk = appIds.slice(i, i + CHUNK);
    const chunkResult = await fetchSteamDetailsChunk(chunk);

    if (chunkResult.size === chunk.length) {
      // all returned — merge and continue
      for (const [k, v] of chunkResult) result.set(k, v);
    } else {
      // partial result — merge what we got, retry missing individually
      for (const [k, v] of chunkResult) result.set(k, v);
      const missing = chunk.filter((id) => !chunkResult.has(id));
      for (const appId of missing) {
        const detail = await fetchSteamDetailsSingle(appId);
        if (detail) result.set(appId, detail);
      }
    }
  }
  return result;
}

// ─── IGDB batch lookup ────────────────────────────────────────────────────────

async function fetchIgdbDataBatch(
  steamAppIds: number[]
): Promise<Map<number, IgdbGameData>> {
  const result = new Map<number, IgdbGameData>();
  if (steamAppIds.length === 0) return result;

  const CHUNK = 500;
  const steamToIgdb = new Map<number, number>();

  // Step 1: external_games → steamAppId → igdbGameId (category 1 = Steam)
  for (let i = 0; i < steamAppIds.length; i += CHUNK) {
    const chunk = steamAppIds.slice(i, i + CHUNK);
    const uidList = chunk.map((id) => `"${id}"`).join(",");
    const body = `fields game,uid;\nwhere category = 1 & uid = (${uidList});\nlimit ${CHUNK};`;
    const s = Date.now();
    try {
      const rows = await igdbRepository.fetchIgdbEndpoint<IgdbExternalGame>("external_games", body);
      log(`  external_games chunk [${i}..${i + chunk.length}]: ${Date.now() - s}ms, found: ${rows.length}`);
      for (const row of rows) steamToIgdb.set(Number(row.uid), row.game);
    } catch (err) {
      log(`  external_games chunk FAILED: ${Date.now() - s}ms — ${err}`);
    }
  }
  log(`  external_games total matches: ${steamToIgdb.size}/${steamAppIds.length}`);

  if (steamToIgdb.size === 0) return result;

  // Step 2: fetch game details for resolved IGDB IDs
  const igdbIds = [...new Set(steamToIgdb.values())];
  const fields =
    "id,name,cover.url,genres.name,first_release_date,involved_companies.developer,involved_companies.company.name";
  const igdbGames = new Map<number, IgdbGameData>();

  for (let i = 0; i < igdbIds.length; i += CHUNK) {
    const chunk = igdbIds.slice(i, i + CHUNK);
    const body = `fields ${fields};\nwhere id = (${chunk.join(",")});\nlimit ${CHUNK};`;
    const s = Date.now();
    try {
      const games = await igdbRepository.fetchIgdbEndpoint<IgdbGameData>("games", body);
      log(`  games chunk [${i}..${i + chunk.length}]: ${Date.now() - s}ms, found: ${games.length}`);
      for (const g of games) igdbGames.set(g.id, g);
    } catch (err) {
      log(`  games chunk FAILED: ${Date.now() - s}ms — ${err}`);
    }
  }

  for (const [steamId, igdbId] of steamToIgdb.entries()) {
    const g = igdbGames.get(igdbId);
    if (g) result.set(steamId, g);
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildIgdbCoverUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const normalized = url.startsWith("//") ? `https:${url}` : url;
  return normalized.replace(/t_\w+/, "t_cover_big");
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function importFromSteamWishlist(userId: string, steamId: string) {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) throw new Error("STEAM_API_KEY is not configured on the server.");

  let s = Date.now();

  // 1. Fetch Steam wishlist
  log("STEP 1: fetching Steam wishlist...");
  const response = await axios.get<{ response: { items?: SteamWishlistApiItem[] } }>(
    "https://api.steampowered.com/IWishlistService/GetWishlist/v1/",
    { params: { key: apiKey, steamid: steamId }, timeout: 20000 }
  );
  log(`STEP 1 done: ${Date.now() - s}ms`);

  const items = response.data?.response?.items;
  if (!items || items.length === 0) {
    throw new Error("No wishlist items found. Make sure the Steam profile and wishlist are set to Public.");
  }
  log(`total items from Steam: ${items.length}`);

  // 2. Single DB read — which appIds already exist?
  s = Date.now();
  log("STEP 2: fetching existing wishlist ids from DB...");
  const existingIds = await wishlistRepository.getExistingIgdbIds(userId);
  log(`STEP 2 done: ${Date.now() - s}ms, existing: ${existingIds.size}`);

  // Deduplicate Steam response itself (edge case) and filter already-imported
  const seen = new Set<number>();
  const newItems = items.filter((i) => {
    if (existingIds.has(i.appid) || seen.has(i.appid)) return false;
    seen.add(i.appid);
    return true;
  });
  const alreadyExists = items.length - newItems.length;
  log(`new items to import: ${newItems.length}, already exists / duplicate: ${alreadyExists}`);

  if (newItems.length === 0) return { imported: 0, failed: 0, alreadyExists };

  const newAppIds = newItems.map((i) => i.appid);

  // 3. Batch IGDB lookup — 2 API calls regardless of list size
  s = Date.now();
  log("STEP 3: IGDB external_games batch lookup...");
  const igdbMap = await fetchIgdbDataBatch(newAppIds);
  log(`STEP 3 done: ${Date.now() - s}ms, IGDB matches: ${igdbMap.size}/${newAppIds.length}`);

  // 4. Steam appdetails for games not found in IGDB (name + header_image)
  const missingIds = newAppIds.filter((id) => !igdbMap.has(id));
  log(`STEP 4: fetching Steam details for ${missingIds.length} games not in IGDB...`);
  s = Date.now();
  const steamDetails = await fetchSteamDetails(missingIds);
  log(`STEP 4 done: ${Date.now() - s}ms, names fetched: ${steamDetails.size}/${missingIds.length}`);

  // 5. Build docs
  const docs = newItems.map((item) => {
    const igdb = igdbMap.get(item.appid);
    const steam = steamDetails.get(item.appid);

    const name = igdb?.name ?? steam?.name ?? `App ${item.appid}`;
    const coverUrl =
      buildIgdbCoverUrl(igdb?.cover?.url) ??
      steam?.headerImage ??
      undefined;

    return {
      userId,
      igdbId: item.appid,
      name,
      platform: "steam" as const,
      source: "steam" as const,
      steamAppId: item.appid,
      coverUrl,
      genres: igdb?.genres?.map((g) => g.name) ?? [],
      developer: igdb?.involved_companies?.find((c) => c.developer)?.company?.name,
      releaseYear: igdb?.first_release_date
        ? new Date(igdb.first_release_date * 1000).getFullYear()
        : undefined,
      igdbData: igdb as object | undefined,
    };
  });

  // 6. Bulk insert — unique index on {userId, igdbId} prevents DB-level duplicates
  s = Date.now();
  log(`STEP 5: bulk inserting ${docs.length} docs...`);
  let imported = 0;
  let failed = 0;
  try {
    const inserted = await wishlistRepository.bulkAddToWishlist(docs);
    imported = inserted.length;
    failed = docs.length - imported;
  } catch (err: any) {
    // MongoBulkWriteError with ordered:false — count what actually inserted
    const writeErrors: number = err?.result?.nInserted ?? err?.insertedCount ?? 0;
    imported = writeErrors;
    failed = docs.length - imported;
    log(`bulk insert partial: inserted=${imported}, errors=${err?.writeErrors?.length ?? "?"}`);
  }
  log(`STEP 5 done: ${Date.now() - s}ms, imported: ${imported}, failed: ${failed}`);

  return { imported, failed, alreadyExists };
}
