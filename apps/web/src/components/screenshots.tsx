import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ImagePlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { compressImage, uploadTo } from "@/lib/image";
import { metaQuery } from "@/lib/meta";
import type { Screenshot } from "@/lib/queries";
import { m } from "@/paraglide/messages";

type ScreenshotWithAuthor = Screenshot & { author?: { name: string; username: string | null } };

export function ScreenshotGrid(props: {
  screenshots: ScreenshotWithAuthor[];
  canDelete?: (screenshot: ScreenshotWithAuthor) => boolean;
  showAuthor?: boolean;
}) {
  const [selected, setSelected] = useState<ScreenshotWithAuthor | null>(null);
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.screenshots[":id"].$delete({ param: { id } })),
    onSuccess: async () => {
      setSelected(null);
      toast.success(m.deleted());
      await queryClient.invalidateQueries({ queryKey: ["screenshots"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (props.screenshots.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">{m.screenshots_empty()}</p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {props.screenshots.map((screenshot) => (
          <button
            type="button"
            key={screenshot.id}
            onClick={() => setSelected(screenshot)}
            className="bg-muted aspect-video overflow-hidden rounded-md border"
          >
            {screenshot.thumbUrl && (
              <img
                src={screenshot.thumbUrl}
                alt={screenshot.caption ?? ""}
                loading="lazy"
                className="size-full object-cover transition-transform hover:scale-105"
              />
            )}
          </button>
        ))}
      </div>
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-[min(96vw,1400px)] p-2 sm:max-w-[min(96vw,1400px)]">
          <DialogTitle className="sr-only">{selected?.caption ?? m.game_screenshots()}</DialogTitle>
          {selected?.url && (
            <img
              src={selected.url}
              alt={selected.caption ?? ""}
              className="max-h-[80dvh] w-full rounded object-contain"
            />
          )}
          <div className="flex items-center gap-3 px-2 pb-1 text-sm">
            <span className="flex-1">{selected?.caption}</span>
            {props.showAuthor && selected?.author?.username && (
              <Link
                to="/u/$username"
                params={{ username: selected.author.username }}
                className="text-muted-foreground hover:underline"
              >
                @{selected.author.username}
              </Link>
            )}
            {selected && props.canDelete?.(selected) && (
              <Button
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(m.screenshots_delete_confirm())) remove.mutate(selected.id);
                }}
              >
                <Trash2Icon />
                {m.action_delete()}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Seçilen görselleri tarayıcıda WebP'ye çevirir (en uzun kenar 2560 px + 480 px önizleme), imzalı URL'lerle
 * doğrudan depolamaya yükler ve sonra kaydı onaylatır.
 */
export function ScreenshotUploader({ entryId }: { entryId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const meta = useQuery(metaQuery);

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const prepared = await Promise.all(
        files.slice(0, 20).map(async (file) => {
          const [full, thumb] = await Promise.all([
            compressImage(file, 2560),
            compressImage(file, 480, 0.75),
          ]);
          return { full, thumb };
        }),
      );
      const { targets } = await unwrap(
        api.library[":id"].screenshots.uploads.$post({
          param: { id: entryId },
          json: {
            files: prepared.map((item) => ({
              contentType: item.full.blob.type,
              size: item.full.blob.size,
              thumbSize: item.thumb.blob.size,
            })),
          },
        }),
      );
      await Promise.all(
        targets.map(async (target, index) => {
          const item = prepared[index];
          if (!item) return;
          await Promise.all([
            uploadTo(target.upload, item.full.blob),
            uploadTo(target.thumbUpload, item.thumb.blob),
          ]);
        }),
      );
      return unwrap(
        api.library[":id"].screenshots.$post({
          param: { id: entryId },
          json: {
            items: targets.map((target, index) => ({
              key: target.key,
              thumbKey: target.thumbKey,
              width: prepared[index]?.full.width,
              height: prepared[index]?.full.height,
            })),
          },
        }),
      );
    },
    onSuccess: async () => {
      toast.success(m.screenshots_uploaded());
      await queryClient.invalidateQueries({ queryKey: ["screenshots"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (meta.data && !meta.data.features.uploads) {
    return <p className="text-muted-foreground text-xs">{m.screenshots_disabled()}</p>;
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) upload.mutate(files);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <ImagePlusIcon />
        {upload.isPending ? m.screenshots_uploading() : m.action_upload()}
      </Button>
      <span className="text-muted-foreground text-xs">{m.screenshots_hint()}</span>
    </div>
  );
}
