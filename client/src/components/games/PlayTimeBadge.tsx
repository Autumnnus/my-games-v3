import { Clock } from "lucide-react";
import { formatPlayTime } from "@/lib/formatters";

export function PlayTimeBadge({ minutes }: { minutes: number }) {
  if (!minutes) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-text-muted"
    >
      <Clock size={11} />
      {formatPlayTime(minutes)}
    </span>
  );
}
