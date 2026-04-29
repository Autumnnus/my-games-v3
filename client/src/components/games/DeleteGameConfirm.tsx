import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { useDeleteGame } from "@/hooks/useGames";
import type { GameListItem } from "@/api/types";

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
  const deleteGame = useDeleteGame();

  return (
    <GlassModal open={!!game} onClose={onClose} title="Oyunu Kaldır" size="sm">
      {game && (
        <div className="flex flex-col gap-5">
          <p className="text-sm" style={{ color: "var(--theme-text-secondary)" }}>
            <span
              className="font-semibold"
              style={{ color: "var(--theme-text-primary)" }}
            >
              {game.name}
            </span>{" "}
            adlı oyun kütüphanenden kaldırılacak. Bu işlem geri alınamaz.
          </p>
          <div className="flex gap-2 justify-end">
            <GlassButton variant="ghost" onClick={onClose}>
              İptal
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
              Kaldır
            </GlassButton>
          </div>
        </div>
      )}
    </GlassModal>
  );
}
