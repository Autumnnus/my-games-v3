import {
  MAX_UPLOAD_BATCH,
  mediaRules,
  originalImageTypes,
  type UploadQuality,
} from "@my-games/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlusIcon, LoaderCircleIcon, MapPinIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StorageMeter } from "@/components/storage-meter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QualityPicker } from "@/components/upload-quality";
import { api, unwrap } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { type EncodedImage, encodeImage } from "@/lib/media/encoder";
import {
  describeVariants,
  hasGpsLocation,
  putObject,
  releaseUploads,
  runLimited,
  uploadErrorMessage,
} from "@/lib/media/upload";
import type { StorageUsage } from "@/lib/queries";
import { uuid } from "@/lib/uuid";
import { m } from "@/paraglide/messages";

export const ACCEPTED_IMAGES = originalImageTypes.join(",");

type Result =
  | { status: "pending" }
  | { status: "done"; image: EncodedImage; preview: string }
  | { status: "error"; message: string };

type Item = {
  id: string;
  file: File;
  gps: boolean;
  results: Partial<Record<UploadQuality, Result>>;
};

function toItems(files: File[]): Item[] {
  return files.map((file) => ({ id: uuid(), file, gps: false, results: {} }));
}

/** Orijinal modda dosya olduğu gibi gider; türü ve boyutu önceden kontrol edilir. */
function originalProblem(file: File) {
  const rule = mediaRules.screenshot.original?.full;
  if (!rule) return m.upload_unsupported();
  if (!rule.types.includes(file.type)) return m.upload_unsupported();
  if (file.size > rule.maxBytes) return m.upload_too_large({ max: formatBytes(rule.maxBytes) });
  return null;
}

function totalBytes(image: EncodedImage) {
  return image.variants.reduce((sum, variant) => sum + variant.blob.size, 0);
}

/**
 * Seçilen görselleri tarayıcıda hazırlar (worker'da AVIF), boyutları ve kotayı gösterir, onaylanınca imzalı
 * URL'lerle doğrudan depoya yükler ve kaydı onaylatır.
 */
export function ScreenshotUploadDialog(props: {
  entryId: string;
  files: File[];
  usage: StorageUsage;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [quality, setQuality] = useState<UploadQuality>(props.usage.uploadQuality);
  const [items, setItems] = useState<Item[]>(() => toItems(props.files));
  const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());
  /** Başlatılan işler (`id:kalite` ve GPS kontrolü); effect'ler iki kez çalışsa da iş bir kez yapılır. */
  const started = useRef(new Set<string>());

  // Önizleme adresleri pencere kapanınca bırakılır.
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  // GPS kontrolü dosya başına bir kez.
  useEffect(() => {
    for (const item of items) {
      if (started.current.has(`${item.id}:gps`)) continue;
      started.current.add(`${item.id}:gps`);
      void hasGpsLocation(item.file).then((gps) => {
        if (gps)
          setItems((current) => current.map((it) => (it.id === item.id ? { ...it, gps } : it)));
      });
    }
  }, [items]);

  // Seçili kalite için henüz hazırlanmamış görselleri kodla.
  useEffect(() => {
    for (const item of items) {
      if (started.current.has(`${item.id}:${quality}`)) continue;
      started.current.add(`${item.id}:${quality}`);
      const setResult = (result: Result) =>
        setItems((current) =>
          current.map((it) =>
            it.id === item.id ? { ...it, results: { ...it.results, [quality]: result } } : it,
          ),
        );
      const problem = quality === "original" ? originalProblem(item.file) : null;
      if (problem) {
        setResult({ status: "error", message: problem });
        continue;
      }
      setResult({ status: "pending" });
      encodeImage(item.file, "screenshot", quality)
        .then((image) => {
          const thumb = image.variants.find((variant) => variant.name === "thumb");
          const preview = thumb ? URL.createObjectURL(thumb.blob) : "";
          if (preview) previews.current.add(preview);
          setResult({ status: "done", image, preview });
        })
        .catch(() => setResult({ status: "error", message: m.upload_failed_file() }));
    }
  }, [items, quality]);

  const ready = items.flatMap((item) => {
    const result = item.results[quality];
    return result?.status === "done" ? [{ item, image: result.image }] : [];
  });
  const pending = items.some(
    (item) => item.results[quality]?.status !== "done" && item.results[quality]?.status !== "error",
  );
  const adding = ready.reduce((sum, entry) => sum + totalBytes(entry.image), 0);
  const free = props.usage.quotaBytes - props.usage.usedBytes;
  const overQuota = adding > free;
  const gps = quality === "original" && items.some((item) => item.gps);

  const upload = useMutation({
    mutationFn: async () => {
      const { assets } = await unwrap(
        api.library[":id"].screenshots.uploads.$post({
          param: { id: props.entryId },
          json: {
            quality,
            files: ready.map((entry) => ({ variants: describeVariants(entry.image.variants) })),
          },
        }),
      );
      const loaded = new Map<string, number>();
      const report = () =>
        setProgress(
          Math.round(([...loaded.values()].reduce((sum, value) => sum + value, 0) / adding) * 100),
        );
      setProgress(0);
      try {
        await runLimited(
          assets.flatMap((asset, index) =>
            asset.variants.map((target) => async () => {
              const variant = ready[index]?.image.variants.find(
                (item) => item.name === target.name,
              );
              if (!variant) throw new Error("variant missing");
              const key = `${asset.id}:${target.name}`;
              await putObject(target.upload, variant.blob, (bytes) => {
                loaded.set(key, bytes);
                report();
              });
              loaded.set(key, variant.blob.size);
              report();
            }),
          ),
        );
        return await unwrap(
          api.library[":id"].screenshots.$post({
            param: { id: props.entryId },
            json: { items: assets.map((asset) => ({ assetId: asset.id })) },
          }),
        );
      } catch (error) {
        await releaseUploads(assets.map((asset) => asset.id));
        throw error;
      }
    },
    onSuccess: async () => {
      toast.success(m.screenshots_uploaded());
      props.onClose();
      await queryClient.invalidateQueries({ queryKey: ["screenshots"] });
    },
    onError: (error) => {
      setProgress(null);
      toast.error(uploadErrorMessage(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["storage"] }),
  });

  const sizes = useMemo(
    () =>
      new Map(
        items.map((item) => {
          const result = item.results[quality];
          return [item.id, result?.status === "done" ? totalBytes(result.image) : null];
        }),
      ),
    [items, quality],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !upload.isPending && props.onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.upload_title()}</DialogTitle>
        </DialogHeader>

        <QualityPicker value={quality} onChange={setQuality} disabled={upload.isPending} />

        <ul className="grid gap-2">
          {items.map((item) => {
            const result = item.results[quality];
            const size = sizes.get(item.id);
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-xl border p-2">
                <div className="bg-muted grid aspect-video w-24 shrink-0 place-items-center overflow-hidden rounded-md">
                  {result?.status === "done" && result.preview ? (
                    <img src={result.preview} alt="" className="size-full object-cover" />
                  ) : result?.status === "error" ? (
                    <XIcon className="text-destructive size-4" />
                  ) : (
                    <LoaderCircleIcon className="text-muted-foreground size-4 animate-spin" />
                  )}
                </div>
                <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
                  <span className="truncate font-medium">{item.file.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {result?.status === "error" ? (
                      <span className="text-destructive">{result.message}</span>
                    ) : size !== null && size !== undefined ? (
                      quality === "original" ? (
                        m.upload_with_copies({ size: formatBytes(size) })
                      ) : (
                        `${formatBytes(item.file.size)} → ${formatBytes(size)}`
                      )
                    ) : (
                      `${formatBytes(item.file.size)} · ${m.upload_preparing()}`
                    )}
                  </span>
                </div>
                {item.gps && quality === "original" && (
                  <MapPinIcon className="text-amber-500 size-4 shrink-0" aria-hidden />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={m.upload_remove_file()}
                  disabled={upload.isPending}
                  onClick={() => setItems((current) => current.filter((it) => it.id !== item.id))}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>

        {items.length < MAX_UPLOAD_BATCH && (
          <div>
            <input
              ref={input}
              type="file"
              accept={ACCEPTED_IMAGES}
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                setItems((current) => [...current, ...toItems(files)].slice(0, MAX_UPLOAD_BATCH));
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={upload.isPending}
              onClick={() => input.current?.click()}
            >
              <ImagePlusIcon />
              {m.upload_add_more()}
            </Button>
          </div>
        )}

        {gps && (
          <Alert>
            <MapPinIcon />
            <AlertDescription>{m.upload_gps_warning()}</AlertDescription>
          </Alert>
        )}

        <StorageMeter usage={props.usage} adding={adding} />
        {overQuota && (
          <p className="text-destructive text-sm">
            {m.upload_over_quota({ needed: formatBytes(adding), free: formatBytes(free) })}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={upload.isPending} onClick={props.onClose}>
            {m.action_cancel()}
          </Button>
          <Button
            disabled={pending || overQuota || ready.length === 0 || upload.isPending}
            onClick={() => upload.mutate()}
          >
            {progress !== null
              ? m.upload_progress({ percent: progress })
              : m.upload_submit({ count: ready.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
