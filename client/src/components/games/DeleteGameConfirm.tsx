import type { GameListItem } from "@/api/types";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassModal } from "@/components/ui/GlassModal";
import { useDeleteGame } from "@/hooks/useGames";
import { useTranslation } from "react-i18next";

interface DeleteGameConfirmProps {
  game: GameListItem | null;
  onClose: () => void;
  onDeleted?: (deletedGameId: string) => void;
}

export function DeleteGameConfirm({
  game,
  onClose,
  onDeleted,
}: DeleteGameConfirmProps) {
  const { t } = useTranslation();
  const deleteGame = useDeleteGame();

  return (
    <GlassModal
      open={!!game}
      onClose={onClose}
      title={t("translation:games.deleteConfirm.title")}
      size="sm"
    >
      {game && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{game.name}</span>
            {t("translation:games.deleteConfirm.message")}
          </p>
          <div className="flex gap-2 justify-end">
            <GlassButton variant="ghost" onClick={onClose}>
              {t("translation:common.buttons.cancel")}
            </GlassButton>
            <GlassButton
              variant="danger"
              loading={deleteGame.isPending}
              onClick={() =>
                deleteGame.mutate(game._id, {
                  onSuccess: () => {
                    onClose();
                    onDeleted?.(game._id);
                  },
                })
              }
            >
              {t("translation:common.buttons.remove")}
            </GlassButton>
          </div>
        </div>
      )}
    </GlassModal>
  );
}
