import WishlistItem from "../models/Wishlist";

async function getWishlistByUser(userId: string) {
  return WishlistItem.find({ userId }).sort({ addedAt: -1 });
}

async function addToWishlist(data: {
  userId: string;
  igdbId: number;
  name: string;
  coverUrl?: string;
  platform?: string;
  genres?: string[];
  releaseYear?: number;
  developer?: string;
  igdbData?: object;
  source?: "manual" | "steam";
  steamAppId?: number;
}) {
  const existing = await WishlistItem.findOne({ userId: data.userId, igdbId: data.igdbId });
  if (existing) return existing;
  return WishlistItem.create(data);
}

async function bulkAddToWishlist(
  items: {
    userId: string;
    igdbId: number;
    name: string;
    coverUrl?: string;
    platform?: string;
    genres?: string[];
    releaseYear?: number;
    developer?: string;
    igdbData?: object;
    source?: "manual" | "steam";
    steamAppId?: number;
  }[]
) {
  if (items.length === 0) return [];
  // ordered: false lets remaining docs insert even if some duplicate-key errors occur
  return WishlistItem.insertMany(items, { ordered: false });
}

async function getExistingIgdbIds(userId: string): Promise<Set<number>> {
  const docs = await WishlistItem.find({ userId }, { igdbId: 1 }).lean();
  return new Set(docs.map((d) => d.igdbId));
}

async function removeFromWishlist(id: string, userId: string) {
  return WishlistItem.findOneAndDelete({ _id: id, userId });
}

async function clearWishlist(userId: string) {
  return WishlistItem.deleteMany({ userId });
}

async function isInWishlist(userId: string, igdbId: number) {
  return WishlistItem.findOne({ userId, igdbId });
}

export default {
  getWishlistByUser,
  addToWishlist,
  bulkAddToWishlist,
  getExistingIgdbIds,
  removeFromWishlist,
  clearWishlist,
  isInWishlist,
};
