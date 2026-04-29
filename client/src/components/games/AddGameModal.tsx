import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { IGDBSearchCombobox } from "./IGDBSearchCombobox";
import { GameForm } from "./GameForm";
import { useAddGame } from "@/hooks/useGames";
import { formatCoverUrl } from "@/lib/formatters";
import type { IGDBSearchResult } from "@/api/types";
import type { AddGameInput } from "@/api/games.api";
import { scaleIn } from "@/lib/motion";

interface AddGameModalProps {
  open: boolean;
  onClose: () => void;
  onOpenSteamImport?: () => void;
}

export function AddGameModal({
  open,
  onClose,
  onOpenSteamImport,
}: AddGameModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedIGDB, setSelectedIGDB] = useState<IGDBSearchResult | null>(
    null,
  );
  const addGame = useAddGame();

  function handleClose() {
    onClose();
    setStep(1);
    setSelectedIGDB(null);
  }

  function handleIGDBSelect(game: IGDBSearchResult) {
    setSelectedIGDB(game);
    setStep(2);
  }

  function handleSkipIGDB() {
    setSelectedIGDB(null);
    setStep(2);
  }

  function handleSubmit(data: Partial<AddGameInput>) {
    const payload: AddGameInput = {
      name: data.name ?? selectedIGDB?.name ?? "",
      platform: data.platform ?? "steam",
      status: data.status ?? "activePlaying",
      playTime: data.playTime ?? 0,
      rating: data.rating,
      review: data.review,
      isFavorite: data.isFavorite ?? false,
      photo: selectedIGDB?.cover?.url
        ? formatCoverUrl(selectedIGDB.cover.url, "big")
        : undefined,
      igdb: selectedIGDB
        ? {
            id: selectedIGDB.id,
            name: selectedIGDB.name,
            cover: selectedIGDB.cover,
            genres: selectedIGDB.genres,
          }
        : undefined,
    };
    addGame.mutate(payload, { onSuccess: handleClose });
  }

  return (
    <GlassModal
      open={open}
      onClose={handleClose}
      title="Oyun Ekle"
      size="md"
      allowOverflow
    >
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div
            key="step1"
            variants={scaleIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex flex-col gap-4"
          >
            <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
              IGDB'de ara, Steam kütüphanenden seç veya elle gir.
            </p>
            <IGDBSearchCombobox onSelect={handleIGDBSelect} />
            {onOpenSteamImport && (
              <GlassButton
                variant="ghost"
                onClick={() => {
                  handleClose();
                  onOpenSteamImport();
                }}
                className="w-full"
              >
                Steam kütüphaneden ekle
              </GlassButton>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1 border-t border-white/10" />
              <span
                className="text-xs"
                style={{ color: "var(--theme-text-muted)" }}
              >
                veya
              </span>
              <div className="flex-1 border-t border-white/10" />
            </div>
            <GlassButton
              variant="default"
              onClick={handleSkipIGDB}
              className="w-full"
            >
              IGDB olmadan elle ekle
            </GlassButton>
          </motion.div>
        ) : (
          <motion.div
            key="step2"
            variants={scaleIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex flex-col gap-4"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep(1)}
                className="glass-btn p-1.5 rounded-lg"
                aria-label="Geri"
              >
                <ChevronLeft size={15} />
              </button>
              {selectedIGDB && (
                <div className="flex items-center gap-2">
                  {selectedIGDB.cover?.url && (
                    <img
                      src={formatCoverUrl(selectedIGDB.cover.url, "thumb")}
                      alt={selectedIGDB.name}
                      className="w-8 h-10 rounded-lg object-cover"
                    />
                  )}
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--theme-text-primary)" }}
                    >
                      {selectedIGDB.name}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--theme-text-muted)" }}
                    >
                      IGDB seçildi
                    </p>
                  </div>
                </div>
              )}
            </div>
            <GameForm
              defaultValues={{ name: selectedIGDB?.name }}
              onSubmit={handleSubmit}
              isLoading={addGame.isPending}
              submitLabel="Kütüphaneye Ekle"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </GlassModal>
  );
}
