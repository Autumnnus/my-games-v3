import wishlistRepository from "../repository/wishlist.repository";
import axios from "axios";

interface SteamWishlistApiItem {
  appid: number;
  priority: number;
  date_added: number;
}

interface SteamAppDetail {
  success: boolean;
  data?: { name: string };
}

async function fetchAppNames(appIds: number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  // Steam app details API accepts up to ~50 appids at once reliably
  const chunkSize = 50;
  for (let i = 0; i < appIds.length; i += chunkSize) {
    const chunk = appIds.slice(i, i + chunkSize);
    try {
      const response = await axios.get<Record<string, SteamAppDetail>>(
        "https://store.steampowered.com/api/appdetails",
        { params: { appids: chunk.join(","), filters: "basic" }, timeout: 15000 }
      );
      for (const [id, detail] of Object.entries(response.data)) {
        if (detail.success && detail.data?.name) {
          names.set(Number(id), detail.data.name);
        }
      }
    } catch {
      // If chunk fails, names will fall back to "App {appid}"
    }
  }
  return names;
}

export async function importFromSteamWishlist(userId: string, steamId: string) {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) throw new Error("STEAM_API_KEY is not configured on the server.");

  const response = await axios.get<{ response: { items?: SteamWishlistApiItem[] } }>(
    "https://api.steampowered.com/IWishlistService/GetWishlist/v1/",
    { params: { key: apiKey, steamid: steamId }, timeout: 20000 }
  );

  const items = response.data?.response?.items;
  if (!items || items.length === 0) {
    throw new Error("No wishlist items found. Make sure the Steam profile and wishlist are set to Public.");
  }

  const appIds = items.map((i) => i.appid);
  const nameMap = await fetchAppNames(appIds);

  const results = { imported: 0, failed: 0, alreadyExists: 0 };

  for (const item of items) {
    try {
      const existing = await wishlistRepository.isInWishlist(userId, item.appid);
      if (existing) {
        results.alreadyExists++;
        continue;
      }
      await wishlistRepository.addToWishlist({
        userId,
        igdbId: item.appid,
        name: nameMap.get(item.appid) ?? `App ${item.appid}`,
        platform: "steam",
        source: "steam",
        steamAppId: item.appid,
      });
      results.imported++;
    } catch {
      results.failed++;
    }
  }

  return results;
}