import { useState } from "react";
import { motion } from "framer-motion";
import { Expand, ImageOff, Trash2, Gamepad2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Screenshot } from "@/api/types";
import { scaleIn } from "@/lib/motion";

interface GameInfo {
  _id: string;
  name: string;
  slug?: string;
  steamAppId?: number;
  coverImage?: string;
}

function getGameInfo(ss: Screenshot): GameInfo | null {
  if (!ss.libraryEntry) return null;
  if (typeof ss.libraryEntry === "object" && "game" in ss.libraryEntry) {
    const le = ss.libraryEntry as { game: GameInfo };
    return le.game ?? null;
  }
  if (typeof ss.libraryEntry === "object" && "_id" in ss.libraryEntry) {
    return ss.libraryEntry as unknown as GameInfo;
  }
  return ss.game ?? null;
}

interface ScreenshotCardProps {
  screenshot: Screenshot;
  onClick?: () => void;
  onDelete?: (id: string) => void;
  readonly?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export function ScreenshotCard({
  screenshot,
  onClick,
  onDelete,
  readonly = false,
  selectable = false,
  selected = false,
  onSelect,
}: ScreenshotCardProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelect) onSelect(screenshot._id);
  };

  const isImageUrl = (url: string) =>
    /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)(\?|$)/i.test(url) ||
    url.includes("picsum.photos") ||
    url.includes("cdn.") ||
    url.includes("imgur.com") ||
    url.includes("images.unsplash.com");

  const showAsImage =
    screenshot.type === "image" ||
    (screenshot.type === "text" && isImageUrl(screenshot.url));

  return (
    <motion.div
      variants={scaleIn}
      className={`relative overflow-hidden rounded-xl group cursor-pointer ${selected ? "ring-2 ring-blue-500 ring-offset-1 ring-offset-transparent" : ""}`}
      style={selected ? { background: "rgba(59,130,246,0.08)" } : {}}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={selectable ? handleCheckboxClick : onClick}
    >
      {showAsImage ? (
        imgError ? (
          <div className="w-full flex flex-col items-center justify-center gap-2 py-12 border border-dashed border-white/20 rounded-xl bg-white/5">
            <ImageOff size={32} style={{ color: "rgba(255,255,255,0.35)" }} />
            <span
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Görsel yüklenemedi
            </span>
          </div>
        ) : (
          <img
            src={screenshot.thumbnail ?? screenshot.url}
            alt={screenshot.name ?? "Ekran görüntüsü"}
            loading="lazy"
            decoding="async"
            className="w-full object-cover"
            style={{ display: "block" }}
            onError={() => setImgError(true)}
          />
        )
      ) : (
        <div
          className="w-full p-4 text-sm leading-relaxed glass-card rounded-xl break-all"
          style={{ color: "rgba(255,255,255,0.8)", minHeight: 100 }}
        >
          <a
            href={screenshot.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white"
          >
            {screenshot.url}
          </a>
        </div>
      )}

      {/* Selection checkbox overlay */}
      {selectable && (
        <div
          className="absolute top-2 left-2 z-10"
          onClick={handleCheckboxClick}
        >
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              selected
                ? "bg-green-500 border-green-500"
                : "bg-black/40 border-white/50"
            }`}
          >
            {selected && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path
                  d="M1 4L3.5 6.5L9 1"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Action overlay */}
      {!selectable && hovered && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2 rounded-xl">
          {onClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="glass-btn p-2 rounded-xl"
              aria-label={t('common.aria.zoom')}
            >
              <Expand size={15} />
            </button>
          )}
          {!readonly && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(screenshot._id);
              }}
              className="glass-btn glass-btn-danger p-2 rounded-xl"
              aria-label={t('common.aria.delete')}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}

      {/* Game info below image */}
      {(() => {
        const game = getGameInfo(screenshot);
        if (!game) return null;
        return (
          <div className="mt-1 px-1">
            <span
              className="text-xs truncate block"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              <Gamepad2 size={10} className="inline mr-1" />
              {game.name}
            </span>
          </div>
        );
      })()}

      {/* Name overlay at bottom */}
      {screenshot.name && (
        <div
          className="absolute bottom-0 left-0 right-0 px-3 py-2 text-xs font-medium truncate"
          style={{
            background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {screenshot.name}
        </div>
      )}
    </motion.div>
  );
}
