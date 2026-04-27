import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { useDeleteAllScreenshots } from "@/hooks/useScreenshots";

interface DeleteAllScreenshotsConfirmProps {
  gameId: string;
  gameName: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

export function DeleteAllScreenshotsConfirm({
  gameId,
  gameName,
  open,
  onClose,
  onDeleted,
}: DeleteAllScreenshotsConfirmProps) {
  const deleteAll = useDeleteAllScreenshots(gameId);

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Tüm Ekran Görüntülerini Sil"
      size="sm"
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          <span
            className="font-semibold"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {gameName}
          </span>{" "}
          için tüm ekran görüntüleri silinecek. Bu işlem geri alınamaz.
        </p>
        <div className="flex gap-2 justify-end">
          <GlassButton variant="ghost" onClick={onClose}>
            İptal
          </GlassButton>
          <GlassButton
            variant="danger"
            loading={deleteAll.isPending}
            onClick={() =>
              deleteAll.mutate(undefined, {
                onSuccess: () => {
                  onClose();
                  onDeleted?.();
                },
              })
            }
          >
            Tümünü Sil
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
