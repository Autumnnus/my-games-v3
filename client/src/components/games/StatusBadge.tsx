import { useTranslation } from "react-i18next";
import { CalendarCheck } from "lucide-react";
import type { GameStatus } from "@my-games/shared";
import { GlassBadge } from "@/components/ui/GlassBadge";
import { STATUS_COLORS } from "@/lib/constants";

const STATUS_KEYS: Record<string, string> = {
  activePlaying: "games.status.activePlaying",
  completed: "games.status.completed",
  backlog: "games.status.backlog",
  abandoned: "games.status.abandoned",
  toBeCompleted: "games.status.toBeCompleted",
};

interface StatusBadgeProps {
  status: GameStatus;
  completionDate?: Date | string | null;
  className?: string;
}

export function StatusBadge({ status, completionDate, className }: StatusBadgeProps) {
  const { t } = useTranslation();
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <GlassBadge color={color} className={className}>
      {t(STATUS_KEYS[status] ?? status)}
      {status === "completed" && completionDate && (
        <CalendarCheck size={12} className="ml-1 inline-block" />
      )}
    </GlassBadge>
  );
}
