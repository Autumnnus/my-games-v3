import type { GameListItem as GameListItemType } from "@/api/types";
import { formatCoverUrl, formatRating } from "@/lib/formatters";
import { fadeUp } from "@/lib/motion";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Edit2, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlatformIcon } from "./PlatformIcon";
import { PlayTimeBadge } from "./PlayTimeBadge";
import { StatusBadge } from "./StatusBadge";

interface GameListItemProps {
  game: GameListItemType;
  onEdit?: (game: GameListItemType) => void;
  onDelete?: (game: GameListItemType) => void;
  readonly?: boolean;
}

export function GameListItem({
  game,
  onEdit,
  onDelete,
  readonly = false,
}: GameListItemProps) {
  const { t } = useTranslation();
  const steamOrPrimaryCoverUrl = game.photo
    ? formatCoverUrl(game.photo, "thumb")
    : null;
  const igdbCoverUrl = game.igdb?.cover?.url
    ? formatCoverUrl(game.igdb.cover.url, "thumb")
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
      className="glass-card-sm glass-card-hover flex items-center gap-3 p-3 group"
    >
      <Link
        to="/games/$id"
        params={{ id: game._id }}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0 theme-cover-placeholder">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={game.name}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={() => {
                if (imageSrc !== igdbCoverUrl && igdbCoverUrl) {
                  setImageSrc(igdbCoverUrl);
                  return;
                }
                setImageSrc(null);
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg">
              🎮
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {game.isFavorite && (
              <Star
                size={12}
                className="fill-yellow-400 text-yellow-400 shrink-0"
              />
            )}
            <p className="text-sm font-medium truncate text-text-primary">
              {game.name}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={game.status} />
            <PlatformIcon platform={game.platform} />
            <PlayTimeBadge minutes={game.playTime} />
          </div>
        </div>
      </Link>

      {game.rating !== undefined && game.rating !== null && (
        <div className="shrink-0 text-sm font-medium text-text-secondary">
          ⭐ {formatRating(game.rating)}
        </div>
      )}

      {!readonly && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onEdit && (
            <button
              onClick={() => onEdit(game)}
              className="glass-btn p-1.5 rounded-lg"
              aria-label={t("translation:common.aria.edit")}
            >
              <Edit2 size={13} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(game)}
              className="glass-btn glass-btn-danger p-1.5 rounded-lg"
              aria-label={t("translation:common.aria.delete")}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
