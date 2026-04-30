import type { AddGameInput } from "@/api/games.api";
import type { GameListItem } from "@/api/types";
import { GlassModal } from "@/components/ui/GlassModal";
import { useEditGame } from "@/hooks/useGames";
import { useTranslation } from "react-i18next";
import { GameForm } from "./GameForm";

interface EditGameModalProps {
  game: GameListItem | null;
  onClose: () => void;
}

export function EditGameModal({ game, onClose }: EditGameModalProps) {
  const { t } = useTranslation();
  const editGame = useEditGame();

  function handleSubmit(data: Partial<AddGameInput>) {
    if (!game) return;
    editGame.mutate({ id: game._id, data }, { onSuccess: onClose });
  }

  return (
    <GlassModal
      open={!!game}
      onClose={onClose}
      title={t("translation:games.form.editTitle")}
      size="md"
    >
      {game && (
        <GameForm
          defaultValues={game}
          onSubmit={handleSubmit}
          isLoading={editGame.isPending}
          submitLabel={t("translation:common.buttons.update")}
        />
      )}
    </GlassModal>
  );
}
