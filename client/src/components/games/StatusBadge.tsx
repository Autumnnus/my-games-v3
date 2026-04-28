import { CalendarCheck } from "lucide-react";
import type { GameStatus } from "@my-games/shared";
import { GlassBadge } from "@/components/ui/GlassBadge";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";

interface StatusBadgeProps {
  status: GameStatus;
  completionDate?: Date | string | null;
  className?: string;
}

export function StatusBadge({ status, completionDate, className }: StatusBadgeProps) {
  return (
    <GlassBadge color={STATUS_COLORS[status]} className={className}>
      {STATUS_LABELS[status]}
      {status === "completed" && completionDate && (
        <CalendarCheck size={12} className="ml-1 inline-block" />
      )}
    </GlassBadge>
  );
}