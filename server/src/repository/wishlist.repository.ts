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

async function removeFromWishlist(id: string, userId: string) {
  return WishlistItem.findOneAndDelete({ _id: id, userId });
}

async function clearWishlist(userId: string) {
  return WishlistItem.deleteMany({ userId });
}

async function isInWishlist(userId: string, igdbId: number) {
  return WishlistItem.findOne({ userId, igdbId });
}

export default { getWishlistByUser, addToWishlist, removeFromWishlist, clearWishlist, isInWishlist };
