import type { GameListItem } from "@/api/types";
import { SyncStatusBadge } from "@/components/steam-sync/SyncStatusBadge";
import { formatCoverUrl } from "@/lib/formatters";
import { fadeUp } from "@/lib/motion";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Edit2, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlatformIcon } from "./PlatformIcon";
import { PlayTimeBadge } from "./PlayTimeBadge";
import { StatusBadge } from "./StatusBadge";

interface GameCardProps {
  game: GameListItem;
  onEdit?: (game: GameListItem) => void;
  onDelete?: (game: GameListItem) => void;
  readonly?: boolean;
}

export function GameCard({
  game,
  onEdit,
  onDelete,
  readonly = false,
}: GameCardProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const steamOrPrimaryCoverUrl = game.photo
    ? formatCoverUrl(game.photo, "big")
    : null;
  const igdbCoverUrl = game.igdb?.cover?.url
    ? formatCoverUrl(game.igdb.cover.url, "big")
    : null;
  const [imageSrc, setImageSrc] = useState<string | null>(
    steamOrPrimaryCoverUrl ?? igdbCoverUrl ?? null,
  );
  useEffect(() => {
    setImageSrc(steamOrPrimaryCoverUrl ?? igdbCoverUrl ?? null);
  }, [steamOrPrimaryCoverUrl, igdbCoverUrl]);

  return (
    <motion.div
      variants={fadeUp}
      className="glass-card glass-card-hover overflow-hidden group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Cover */}
      <Link to="/games/$id" params={{ id: game._id }} className="block">
        <div
          className="relative theme-cover-placeholder"
          style={{ aspectRatio: "3/4" }}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={game.name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
              style={{ aspectRatio: "3/4" }}
              onError={() => {
                if (imageSrc !== igdbCoverUrl && igdbCoverUrl) {
                  setImageSrc(igdbCoverUrl);
                  return;
                }
                setImageSrc(null);
              }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ fontSize: "2rem" }}
            >
              🎮
            </div>
          )}
          {/* Favorite indicator */}
          {game.isFavorite && (
            <div className="absolute top-2 right-2">
              <Star size={14} className="fill-yellow-400 text-yellow-400" />
            </div>
          )}
          {/* Status overlay on hover */}
          {hovered && !readonly && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2 transition-all">
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onEdit(game);
                  }}
                  className="glass-btn p-2 rounded-xl"
                  aria-label={t("translation:common.buttons.edit")}
                >
                  <Edit2 size={15} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onDelete(game);
                  }}
                  className="glass-btn glass-btn-danger p-2 rounded-xl"
                  aria-label={t("translation:common.buttons.delete")}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5">
        <p className="text-sm font-medium leading-snug line-clamp-1 text-text-primary">
          {game.name}
        </p>
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={game.status} />
          <div className="flex items-center gap-1.5">
            {(game as any).syncStatus && (
              <SyncStatusBadge syncStatus={(game as any).syncStatus} />
            )}
            <PlatformIcon platform={game.platform} />
          </div>
        </div>
        <PlayTimeBadge minutes={game.playTime} />
      </div>
    </motion.div>
  );
}
