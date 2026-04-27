import type { GameStatus } from "@my-games/shared";
import { GlassBadge } from "@/components/ui/GlassBadge";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";

interface StatusBadgeProps {
  status: GameStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <GlassBadge color={STATUS_COLORS[status]} className={className}>
      {STATUS_LABELS[status]}
    </GlassBadge>
  );
}
