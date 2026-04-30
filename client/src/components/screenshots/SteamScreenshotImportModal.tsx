import { isApiError } from "@/api/client";
import type { SteamScreenshotItem } from "@/api/steam.api";
import { steamApi } from "@/api/steam.api";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassModal } from "@/components/ui/GlassModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useImportSteamScreenshots } from "@/hooks/useScreenshots";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, Square } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  gameId: string;
  steamAppId: number;
  open: boolean;
  onClose: () => void;
  inline?: boolean;
}

function ScreenshotThumb({
  item,
  selected,
  onToggle,
}: {
  item: SteamScreenshotItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const thumb = item.previewUrl || item.fileUrl;

  return (
    <button
      onClick={onToggle}
      className={`relative group rounded-xl overflow-hidden aspect-video outline-2 outline-offset-2 ${selected ? "outline-accent" : "outline-transparent"}`}
    >
      {thumb ? (
        <img
          src={thumb}
          alt={item.title || t("translation:screenshots.steamScreenshot")}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs bg-surface-subtle text-text-muted">
          Önizleme yok
        </div>
      )}

      {/* Overlay */}
      <div
        className={`absolute inset-0 transition-opacity ${selected ? "opacity-100 bg-accent-soft" : "opacity-0"}`}
      />

      {/* Checkbox */}
      <span
        className={`absolute top-1.5 right-1.5 transition-opacity ${selected ? "opacity-100 text-accent" : "opacity-0 text-text-muted"}`}
        style={{}}
      >
        <CheckSquare size={18} />
      </span>

      {/* Hover overlay */}
      <div
        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "rgba(0,0,0,0.4)" }}
      >
        {selected ? (
          <CheckSquare size={24} className="text-accent" />
        ) : (
          <Square size={24} className="text-text-secondary" />
        )}
      </div>

      {/* Title tooltip */}
      {item.title && (
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs text-text-primary truncate opacity-0 group-hover:opacity-100 transition-opacity bg-black/70">
          {item.title}
        </div>
      )}
    </button>
  );
}

export function SteamScreenshotImportModal({
  gameId,
  steamAppId,
  open,
  onClose,
  inline = false,
}: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const importMutation = useImportSteamScreenshots(gameId);

  const {
    data: screenshots,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["steam-screenshots", steamAppId],
    queryFn: () => steamApi.getScreenshots(steamAppId),
    enabled: open,
    staleTime: 2 * 60_000,
  });

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!screenshots?.length) return;
    if (selected.size === screenshots.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(screenshots.map((s) => s.id)));
    }
  }

  function handleImport() {
    if (!screenshots) return;
    const items = screenshots
      .filter((s) => selected.has(s.id))
      .map((s) => ({
        url: s.fileUrl || s.previewUrl,
        thumbnail: s.previewUrl || undefined,
        name: s.title || undefined,
      }))
      .filter((i) => !!i.url);

    importMutation.mutate(items, {
      onSuccess: () => {
        setSelected(new Set());
        onClose();
      },
    });
  }

  function handleClose() {
    setSelected(new Set());
    onClose();
  }

  const allSelected =
    !!screenshots?.length && selected.size === screenshots.length;
  const errorMessage = error
    ? isApiError(error)
      ? error.message
      : t("screenshots.steamLoadFailed")
    : null;

  const content = isLoading ? (
    <div className="flex items-center justify-center py-16">
      <LoadingSpinner size="lg" />
    </div>
  ) : errorMessage ? (
    <div className="text-center py-12 text-sm text-text-muted">
      {errorMessage}
    </div>
  ) : !screenshots?.length ? (
    <div className="text-center py-12 text-sm text-text-muted">
      {t("translation:screenshots.noPublicScreenshots")}
      <br />
      <span className="text-xs mt-1 block text-text-muted">
        {t("translation:screenshots.onlyPublicHint")}
      </span>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">
          {screenshots.length} {t("translation:screenshots.count")}
        </span>
        <button
          onClick={toggleAll}
          className={`text-xs flex items-center gap-1.5 transition-colors ${allSelected ? "text-accent" : "text-text-muted"}`}
        >
          {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
          {allSelected
            ? t("screenshots.deselectAll")
            : t("screenshots.selectAll")}
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto pr-1">
        {screenshots.map((s) => (
          <ScreenshotThumb
            key={s.id}
            item={s}
            selected={selected.has(s.id)}
            onToggle={() => toggleItem(s.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <GlassButton
        variant="primary"
        disabled={selected.size === 0}
        loading={importMutation.isPending}
        onClick={handleImport}
        className="w-full"
      >
        {selected.size > 0
          ? t("screenshots.addN", { count: selected.size })
          : t("screenshots.selectToAdd")}
      </GlassButton>
    </div>
  );

  if (inline) return content;

  return (
    <GlassModal
      open={open}
      onClose={handleClose}
      title={t("screenshots.steamTitle")}
      size="lg"
    >
      {content}
    </GlassModal>
  );
}
