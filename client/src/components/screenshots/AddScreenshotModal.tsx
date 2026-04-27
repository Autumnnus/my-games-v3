import { useState, useRef } from "react";
import { Upload, Link as LinkIcon, Gamepad2, X } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import {
  useAddImageScreenshot,
  useAddTextScreenshot,
} from "@/hooks/useScreenshots";
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
  const [tab, setTab] = useState<Tab>("image");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addImage = useAddImageScreenshot(gameId);
  const addText = useAddTextScreenshot(gameId);

  // FILE TAB STATE
  const [files, setFiles] = useState<
    Array<{ file: File; name: string; preview: string }>
  >([]);

  // URL TAB STATE
  const [urlItems, setUrlItems] = useState<
    Array<{ url: string; name: string; isImageUrl: boolean }>
  >([]);
  const [urlInput, setUrlInput] = useState("");

  function handleClose() {
    // Cleanup object URLs
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setUrlItems([]);
    setUrlInput("");
    onClose();
  }

  // FILE TAB HANDLERS
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

  // URL TAB HANDLERS
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
      {
        onSuccess: handleClose,
      },
    );
  }

  return (
    <GlassModal
      open={open}
      onClose={handleClose}
      title="Ekran Görüntüsü Ekle"
      size="md"
    >
      {/* Tabs */}
      <div className="flex items-center glass-card-sm p-0.5 gap-0.5 mb-5">
        {(
          ["image", "text", ...(steamAppId ? ["steam" as Tab] : [])] as Tab[]
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-xl transition-all ${tab === t ? "glass-btn-primary" : ""}`}
            style={{ color: tab === t ? "white" : "rgba(255,255,255,0.5)" }}
          >
            {t === "image" ? (
              <Upload size={14} />
            ) : t === "text" ? (
              <LinkIcon size={14} />
            ) : (
              <Gamepad2 size={14} />
            )}
            {t === "image"
              ? "Resim Yükle"
              : t === "text"
                ? "URL / Metin"
                : "Steam"}
          </button>
        ))}
      </div>

      {tab === "image" ? (
        <div className="flex flex-col gap-4">
          {/* Dropzone — hidden when files exist, shown otherwise */}
          {files.length === 0 ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${dragging ? "border-purple-500/60 bg-purple-500/10" : "border-white/15 hover:border-white/25"}`}
            >
              <Upload size={28} style={{ color: "rgba(255,255,255,0.3)" }} />
              <div className="text-center">
                <p
                  className="text-sm font-medium"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  Dosya sürükle veya tıkla
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
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
              className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors ${dragging ? "border-purple-500/60 bg-purple-500/10" : "border-white/15 hover:border-white/25"}`}
            >
              <Upload size={18} style={{ color: "rgba(255,255,255,0.3)" }} />
              <p
                className="text-xs"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
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

          {/* Preview queue */}
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
                    className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0 transition-colors"
                    style={{ color: "rgba(255,255,255,0.5)" }}
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
          {/* Existing preview queue */}
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
                    <div className="w-12 h-12 flex items-center justify-center rounded-lg flex-shrink-0 bg-white/5">
                      <LinkIcon
                        size={16}
                        style={{ color: "rgba(255,255,255,0.4)" }}
                      />
                    </div>
                  )}
                  <GlassInput
                    value={item.name}
                    onChange={(e) => updateUrlName(index, e.target.value)}
                    className="flex-1 !py-1.5 !px-2 !text-sm"
                  />
                  <button
                    onClick={() => removeUrl(index)}
                    className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0 transition-colors"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* URL input */}
          <GlassInput
            label="URL veya Metin"
            placeholder="https://... veya not metni"
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
            variant="secondary"
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
