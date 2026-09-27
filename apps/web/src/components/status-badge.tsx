import type { EntryStatus } from "@my-games/shared";
import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/format";

const variants: Record<EntryStatus, "default" | "secondary" | "outline" | "destructive"> = {
  playing: "default",
  completed: "secondary",
  paused: "outline",
  dropped: "destructive",
  backlog: "outline",
  wishlist: "outline",
  endless: "secondary",
};

export function StatusBadge({ status }: { status: EntryStatus }) {
  return <Badge variant={variants[status]}>{statusLabel(status)}</Badge>;
}
