import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassModal } from "@/components/ui/GlassModal";
import {
  useAddImageScreenshot,
  useAddTextScreenshot,
} from "@/hooks/useScreenshots";
import { cn } from "@/lib/cn";
import { Gamepad2, Link as LinkIcon, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SteamScreenshotImportModal } from "./SteamScreenshotImportModal";

interface AddScreenshotModalProps {
  gameId: string;
  steamAppId?: number;
  open: boolean;
  onClose: () => void;
}

type Tab = "image" | "text" | "steam";

function isImageUrl(url: string) {
  return (
    /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)(\?|$)/i.test(url) ||
    url.includes("picsum.photos") ||
    url.includes("cdn.") ||
    url.includes("imgur.com") ||
    url.includes("images.unsplash.com")
  );
}

export function AddScreenshotModal({
  gameId,
  steamAppId,
  open,
  onClose,
}: AddScreenshotModalProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("image");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addImage = useAddImageScreenshot(gameId);
  const addText = useAddTextScreenshot(gameId);

  const [files, setFiles] = useState<
    Array<{ file: File; name: string; preview: string }>
  >([]);
  const [urlItems, setUrlItems] = useState<
    Array<{ url: string; name: string; isImageUrl: boolean }>
  >([]);
  const [urlInput, setUrlInput] = useState("");

  function handleClose() {
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setUrlItems([]);
    setUrlInput("");
    onClose();
  }

  function handleFileChange(fileList: FileList | null) {
    if (!fileList?.length) return;
    const newFiles = Array.from(fileList).map((file) => ({
      file,
      name: file.name.replace(/\.[^.]+$/, ""),
      preview: URL.createObjectURL(file),
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFileChange(e.dataTransfer.files);
  }

  function updateFileName(index: number, name: string) {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, name } : f)));
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleFilesSubmit() {
    if (!files.length) return;
    const formData = new FormData();
    files.forEach((f, i) => {
      formData.append("files", f.file);
      formData.append(`name_${i}`, f.name);
    });
    addImage.mutate(formData, { onSuccess: handleClose });
  }

  function addUrlItem() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setUrlItems((prev) => [
      ...prev,
      {
        url: trimmed,
        name: trimmed.slice(0, 40),
        isImageUrl: isImageUrl(trimmed),
      },
    ]);
    setUrlInput("");
  }

  function updateUrlName(index: number, name: string) {
    setUrlItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, name } : item)),
    );
  }

  function removeUrl(index: number) {
    setUrlItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUrlsSubmit() {
    if (!urlItems.length) return;
    addText.mutate(
      urlItems.map((item) => ({ url: item.url, name: item.name || undefined })),
      { onSuccess: handleClose },
    );
  }

  const dropzoneClass = (compact: boolean) =>
    cn(
      "border-2 border-dashed rounded-2xl flex flex-col items-center gap-3 cursor-pointer transition-colors",
      compact ? "p-4 gap-2" : "p-10",
      dragging
        ? "border-accent/60 bg-accent-soft"
        : "border-glass-border-hover hover:border-glass-border",
    );

  return (
    <GlassModal
      open={open}
      onClose={handleClose}
      title={t("translation:screenshots.addTitle")}
      size="md"
    >
      {/* Tabs */}
      <div className="flex items-center glass-card-sm p-0.5 gap-0.5 mb-5">
        {(
          ["image", "text", ...(steamAppId ? ["steam" as Tab] : [])] as Tab[]
        ).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-xl transition-all",
              tab === tabKey
                ? "glass-btn-primary text-white"
                : "text-text-muted",
            )}
          >
            {tabKey === "image" ? (
              <Upload size={14} />
            ) : tabKey === "text" ? (
              <LinkIcon size={14} />
            ) : (
              <Gamepad2 size={14} />
            )}
            {tabKey === "image"
              ? t("translation:screenshots.tabImage")
              : tabKey === "text"
                ? t("translation:screenshots.tabText")
                : t("translation:screenshots.fromSteam")}
          </button>
        ))}
      </div>

      {tab === "image" ? (
        <div className="flex flex-col gap-4">
          {files.length === 0 ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileRef.current?.click()}
              className={dropzoneClass(false)}
            >
              <Upload size={28} className="text-text-muted" />
              <div className="text-center">
                <p className="text-sm font-medium text-text-secondary">
                  Dosya sürükle veya tıkla
                </p>
                <p className="text-xs mt-1 text-text-muted">
                  PNG, JPG, GIF, WebP — maks 10MB
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files)}
              />
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileRef.current?.click()}
              className={dropzoneClass(true)}
            >
              <Upload size={18} className="text-text-muted" />
              <p className="text-xs text-text-muted">
                Daha fazla eklemek için sürükle veya tıkla
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files)}
              />
            </div>
          )}

          {files.length > 0 && (
            <div className="flex flex-col gap-2">
              {files.map((f, index) => (
                <div
                  key={f.preview}
                  className="flex items-center gap-2 p-2 glass-card-sm rounded-xl"
                >
                  <img
                    src={f.preview}
                    alt={f.name}
                    className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                  />
                  <GlassInput
                    value={f.name}
                    onChange={(e) => updateFileName(index, e.target.value)}
                    className="flex-1 !py-1.5 !px-2 !text-sm"
                  />
                  <button
                    onClick={() => removeFile(index)}
                    className="p-1.5 rounded-lg hover:bg-glass-surface-hover flex-shrink-0 transition-colors text-text-muted"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <GlassButton
            variant="primary"
            loading={addImage.isPending}
            disabled={files.length === 0}
            onClick={handleFilesSubmit}
            className="w-full"
          >
            Hepsini Gönder ({files.length})
          </GlassButton>
        </div>
      ) : tab === "text" ? (
        <div className="flex flex-col gap-4">
          {urlItems.length > 0 && (
            <div className="flex flex-col gap-2">
              {urlItems.map((item, index) => (
                <div
                  key={`${item.url}-${index}`}
                  className="flex items-center gap-2 p-2 glass-card-sm rounded-xl"
                >
                  {item.isImageUrl ? (
                    <img
                      src={item.url}
                      alt={item.name}
                      className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center rounded-lg flex-shrink-0 bg-glass-surface">
                      <LinkIcon size={16} className="text-text-muted" />
                    </div>
                  )}
                  <GlassInput
                    value={item.name}
                    onChange={(e) => updateUrlName(index, e.target.value)}
                    className="flex-1 !py-1.5 !px-2 !text-sm"
                  />
                  <button
                    onClick={() => removeUrl(index)}
                    className="p-1.5 rounded-lg hover:bg-glass-surface-hover flex-shrink-0 transition-colors text-text-muted"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <GlassInput
            label={t("translation:screenshots.urlOrText")}
            placeholder={t("translation:screenshots.urlPlaceholder")}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrlItem();
              }
            }}
          />
          <GlassButton
            variant="default"
            disabled={!urlInput.trim()}
            onClick={addUrlItem}
            className="w-full"
          >
            Listeye Ekle
          </GlassButton>
          <GlassButton
            variant="primary"
            loading={addText.isPending}
            disabled={urlItems.length === 0}
            onClick={handleUrlsSubmit}
            className="w-full"
          >
            Hepsini Gönder ({urlItems.length})
          </GlassButton>
        </div>
      ) : steamAppId ? (
        <SteamScreenshotImportModal
          gameId={gameId}
          steamAppId={steamAppId}
          open={tab === "steam"}
          onClose={handleClose}
          inline
        />
      ) : null}
    </GlassModal>
  );
}
