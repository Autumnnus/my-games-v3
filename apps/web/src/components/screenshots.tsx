import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, ImagePlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { StorageMeter } from "@/components/storage-meter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ACCEPTED_IMAGES, ScreenshotUploadDialog } from "@/components/upload-dialog";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { metaQuery } from "@/lib/meta";
import { type Screenshot, storageQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

type ScreenshotWithAuthor = Screenshot & { author?: { name: string; username: string | null } };

export function ScreenshotGrid(props: {
  screenshots: ScreenshotWithAuthor[];
  canDelete?: (screenshot: ScreenshotWithAuthor) => boolean;
  showAuthor?: boolean;
}) {
  // Kapanırken son görüntü yerinde kalır (çıkış animasyonu boyunca pencere boşalmasın); `open` ayrı tutulur.
  const [selected, setSelected] = useState<ScreenshotWithAuthor | null>(null);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.screenshots[":id"].$delete({ param: { id } })),
    onSuccess: async () => {
      setOpen(false);
      toast.success(m.deleted());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["screenshots"] }),
        queryClient.invalidateQueries({ queryKey: ["storage"] }),
        // Aktivite önizlemesi ve beğeni/yorumları da silinen görüntüyle gider.
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
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
            onClick={() => {
              setSelected(screenshot);
              setOpen(true);
            }}
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
      <Dialog open={open} onOpenChange={setOpen}>
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
            {selected?.originalUrl && (
              <Button asChild variant="ghost" size="sm">
                <a href={selected.originalUrl} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  {m.screenshot_open_original()}
                </a>
              </Button>
            )}
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
 * Yükleme butonu: seçilen dosyalar yükleme penceresinde hazırlanır (kalite seçimi, boyutlar, kota). Kota ya da
 * sistem deposu doluysa buton kapanır ve nedeni yazılır.
 */
export function ScreenshotUploader({ entryId }: { entryId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const meta = useQuery(metaQuery);
  const storage = useQuery({ ...storageQuery, enabled: meta.data?.features.uploads === true });
  const [files, setFiles] = useState<File[] | null>(null);

  if (meta.data && !meta.data.features.uploads) {
    return <p className="text-muted-foreground text-xs">{m.screenshots_disabled()}</p>;
  }
  const usage = storage.data;
  const blocked = usage
    ? usage.systemFull
      ? m.storage_system_full()
      : usage.usedBytes >= usage.quotaBytes
        ? m.storage_full()
        : null
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGES}
        multiple
        hidden
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (selected.length) setFiles(selected);
        }}
      />
      {usage && <StorageMeter usage={usage} className="w-48" />}
      <Button
        variant="outline"
        size="sm"
        disabled={!usage || !!blocked}
        title={blocked ?? undefined}
        onClick={() => input.current?.click()}
      >
        <ImagePlusIcon />
        {m.action_upload()}
      </Button>
      {blocked && <span className="text-muted-foreground w-full text-xs">{blocked}</span>}
      {files && usage && (
        <ScreenshotUploadDialog
          entryId={entryId}
          files={files}
          usage={usage}
          onClose={() => setFiles(null)}
        />
      )}
    </div>
  );
}
