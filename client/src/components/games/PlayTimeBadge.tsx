import { Clock } from "lucide-react";
import { formatPlayTime } from "@/lib/formatters";

export function PlayTimeBadge({ minutes }: { minutes: number }) {
  if (!minutes) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      style={{ color: "rgba(255,255,255,0.45)" }}
    >
      <Clock size={11} />
      {formatPlayTime(minutes)}
    </span>
  );
}
