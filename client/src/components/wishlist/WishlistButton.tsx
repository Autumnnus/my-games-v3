import { useState, useEffect } from "react";
import { Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { wishlistApi, type WishlistItem } from "@/api/wishlist.api";
import { useAuthStore } from "@/store/auth.store";

interface WishlistButtonProps {
  igdbId: number;
  gameName: string;
  coverUrl?: string;
  platform?: string;
  genres?: string[];
  variant?: "card" | "detail";
  steamAppId?: number;
}

export function WishlistButton({
  igdbId,
  gameName,
  coverUrl,
  platform,
  genres,
  variant = "card",
  steamAppId,
}: WishlistButtonProps) {
  const [inWishlist, setInWishlist] = useState<boolean | null>(null);
  const [wishlistItem, setWishlistItem] = useState<WishlistItem | null>(null);
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    wishlistApi
      .check(igdbId)
      .then((res) => {
        setInWishlist(res.inWishlist);
        setWishlistItem(res.item ?? null);
      })
      .catch(() => setInWishlist(false));
  }, [igdbId, user]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    setLoading(true);
    try {
      if (inWishlist && wishlistItem) {
        await wishlistApi.remove(wishlistItem._id);
        setInWishlist(false);
        setWishlistItem(null);
        toast.success("Removed from wishlist");
      } else {
        const item = await wishlistApi.add({
          igdbId,
          name: gameName,
          coverUrl,
          platform,
          genres,
          steamAppId,
        });
        setInWishlist(true);
        setWishlistItem(item);
        toast.success("Added to wishlist");
      }
    } catch {
      toast.error("Failed to update wishlist");
    } finally {
      setLoading(false);
    }
  };

  const isCard = variant === "card";

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={handleToggle}
      disabled={loading || inWishlist === null}
      className={`${isCard ? "absolute top-2 right-2 z-10 p-1.5 rounded-lg" : "flex items-center gap-2 px-3 py-2 rounded-xl text-sm"} glass-btn transition-all`}
      style={{
        color: inWishlist ? "#ef4444" : "var(--theme-text-muted)",
        background: inWishlist ? "rgba(239,68,68,0.15)" : undefined,
        border: inWishlist ? "1px solid rgba(239,68,68,0.3)" : undefined,
      }}
      aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={inWishlist ? "filled" : "outline"}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <Heart
            size={isCard ? 14 : 16}
            className={inWishlist ? "fill-current" : ""}
          />
        </motion.span>
      </AnimatePresence>
      {variant === "detail" && (
        <span style={{ color: "inherit" }}>
          {inWishlist ? "In Wishlist" : "Add to Wishlist"}
        </span>
      )}
    </motion.button>
  );
}