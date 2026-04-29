import wishlistRepository from "../repository/wishlist.repository";
import axios from "axios";

interface SteamWishlistItem {
  appid: number;
  title: string;
  subs?: Array<{ discount_block: string }>;
}

export async function importFromSteamWishlist(userId: string, steamId: string) {
  try {
    const response = await axios.get<Record<string, SteamWishlistItem>>(
      `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata`,
      { timeout: 15000 }
    );

    const items = Object.values(response.data);
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
          name: item.title,
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
  } catch (error) {
    throw new Error(`Steam wishlist fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}