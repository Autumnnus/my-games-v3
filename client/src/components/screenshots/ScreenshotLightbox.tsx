import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Screenshot } from "@/api/types";
import { GlassButton } from "@/components/ui/GlassButton";

interface GameInfo {
  _id: string;
  name: string;
  slug?: string;
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

function getLibraryEntryId(ss: Screenshot): string | null {
  if (!ss.libraryEntry) return null;
  if (typeof ss.libraryEntry === "object" && "_id" in ss.libraryEntry) {
    return (ss.libraryEntry as { _id: string })._id;
  }
  return null;
}

interface ScreenshotLightboxProps {
  screenshots: Screenshot[];
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function ScreenshotLightbox({
  screenshots,
  index,
  onClose,
  onNavigate,
}: ScreenshotLightboxProps) {
  const { t } = useTranslation();
  const current = index !== null ? screenshots[index] : null;

  useEffect(() => {
    if (index === null) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index! > 0) onNavigate(index! - 1);
      if (e.key === "ArrowRight" && index! < screenshots.length - 1)
        onNavigate(index! + 1);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [index, screenshots.length, onClose, onNavigate]);

  useEffect(() => {
    document.body.style.overflow = index !== null ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [index]);

  return (
    <AnimatePresence>
      {current && index !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            className="glass-overlay absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="relative z-10 flex items-center gap-4 px-4 w-full max-w-5xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          >
            {/* Prev */}
            <GlassButton
              variant="default"
              size="sm"
              className="shrink-0 p-2 rounded-xl"
              onClick={() => onNavigate(index - 1)}
              disabled={index === 0}
              aria-label={t('common.aria.previous')}
            >
              <ChevronLeft size={18} />
            </GlassButton>

            {/* Image */}
            <div className="flex-1 flex items-center justify-center">
              {(() => {
                const isImgUrl =
                  /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)(\?|$)/i.test(
                    current.url,
                  ) ||
                  current.url.includes("picsum.photos") ||
                  current.url.includes("cdn.") ||
                  current.url.includes("imgur.com") ||
                  current.url.includes("images.unsplash.com");
                const showAsImg =
                  current.type === "image" ||
                  (current.type === "text" && isImgUrl);
                if (showAsImg) {
                  return (
                    <img
                      src={current.thumbnail ?? current.url}
                      alt={current.name ?? "Ekran görüntüsü"}
                      className="max-h-[80vh] max-w-full rounded-2xl object-contain"
                      style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
                    />
                  );
                }
                return (
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-card p-6 max-w-lg w-full text-base leading-relaxed hover:text-white underline"
                    style={{ color: "var(--theme-text-secondary)" }}
                  >
                    {current.url}
                  </a>
                );
              })()}
            </div>

            {/* Next */}
            <GlassButton
              variant="default"
              size="sm"
              className="shrink-0 p-2 rounded-xl"
              onClick={() => onNavigate(index + 1)}
              disabled={index === screenshots.length - 1}
              aria-label={t('common.aria.next')}
            >
              <ChevronRight size={18} />
            </GlassButton>
          </motion.div>

          {/* Close & counter */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <span
              className="text-sm glass-card-sm px-3 py-1"
              style={{ color: "var(--theme-text-secondary)" }}
            >
              {index + 1} / {screenshots.length}
            </span>
            <GlassButton
              size="sm"
              className="p-1.5 rounded-xl"
              onClick={onClose}
              aria-label={t('common.aria.close')}
            >
              <X size={16} />
            </GlassButton>
          </div>

          {/* Game info & navigate */}
          {(() => {
            const game = getGameInfo(current);
            const entryId = getLibraryEntryId(current);
            if (!game) return null;
            return (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                <div className="glass-card-sm px-3 py-1.5 flex items-center gap-2">
                  <Gamepad2
                    size={14}
                    style={{ color: "var(--theme-text-secondary)" }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "var(--theme-text-secondary)" }}
                  >
                    {game.name}
                  </span>
                </div>
                {entryId && (
                  <GlassButton
                    size="sm"
                    className="p-1.5 rounded-xl"
                    onClick={() => (window.location.href = `/games/${entryId}`)}
                    title={t('screenshots.lightbox.goToGame')}
                  >
                    <ExternalLink size={14} />
                  </GlassButton>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </AnimatePresence>
  );
}
