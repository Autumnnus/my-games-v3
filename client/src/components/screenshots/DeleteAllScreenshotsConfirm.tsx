import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { useDeleteAllScreenshots } from "@/hooks/useScreenshots";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const deleteAll = useDeleteAllScreenshots(gameId);

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('screenshots.deleteAllConfirm.title')}
      size="sm"
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm" style={{ color: "var(--theme-text-secondary)" }}>
          <span
            className="font-semibold"
            style={{ color: "var(--theme-text-primary)" }}
          >
            {gameName}
          </span>{" "}
          {t('screenshots.deleteAllConfirm.message')}
        </p>
        <div className="flex gap-2 justify-end">
          <GlassButton variant="ghost" onClick={onClose}>
            {t('common.buttons.cancel')}
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
            {t('common.buttons.deleteAll')}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
