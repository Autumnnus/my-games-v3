import { GlassModal } from "@/components/ui/GlassModal";
import { GameForm } from "./GameForm";
import { useEditGame } from "@/hooks/useGames";
import type { GameListItem } from "@/api/types";
import type { AddGameInput } from "@/api/games.api";

interface EditGameModalProps {
  game: GameListItem | null;
  onClose: () => void;
}

export function EditGameModal({ game, onClose }: EditGameModalProps) {
  const editGame = useEditGame();

  function handleSubmit(data: Partial<AddGameInput>) {
    if (!game) return;
    editGame.mutate({ id: game._id, data }, { onSuccess: onClose });
  }

  return (
    <GlassModal open={!!game} onClose={onClose} title="Oyunu Düzenle" size="md">
      {game && (
        <GameForm
          defaultValues={game}
          onSubmit={handleSubmit}
          isLoading={editGame.isPending}
          submitLabel="Güncelle"
        />
      )}
    </GlassModal>
  );
}
