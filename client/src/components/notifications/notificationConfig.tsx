import { Trophy, MessageSquare, Camera, Zap } from "lucide-react";
import type { NotificationType, Notification } from "@my-games/shared";

interface NotificationConfigEntry {
  icon: React.ReactNode;
  rawColor: string;
  bgColor: string;
  borderColor: string;
  title: (n: Notification) => string;
  body: (n: Notification) => string;
  href: (n: Notification) => string | null;
}

export const NOTIFICATION_CONFIG: Record<
  NotificationType,
  NotificationConfigEntry
> = {
  game_completed: {
    icon: <Trophy size={14} />,
    rawColor: "#facc15",
    bgColor: "rgba(234,179,8,0.12)",
    borderColor: "rgba(234,179,8,0.25)",
    title: (n) => `${n.actor.name} bir oyunu tamamladı`,
    body: (n) => {
      const game = n.game?.title ?? "bir oyun";
      const mins = n.metadata.playTimeMinutes;
      const hours = mins ? ` (${Math.round(mins / 60)} saat)` : "";
      return `${game}${hours}`;
    },
    href: (n) =>
      n.metadata.actorLibraryEntryId
        ? `/games/${n.metadata.actorLibraryEntryId}`
        : null,
  },
  game_reviewed: {
    icon: <MessageSquare size={14} />,
    rawColor: "#4ade80",
    bgColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.25)",
    title: (n) => `${n.actor.name} bir oyunu inceledi`,
    body: (n) =>
      n.metadata.review
        ? `"${n.metadata.review.slice(0, 120)}${n.metadata.review.length > 120 ? "…" : ""}"`
        : (n.game?.title ?? ""),
    href: (n) =>
      n.metadata.actorLibraryEntryId
        ? `/games/${n.metadata.actorLibraryEntryId}`
        : null,
  },
  milestone_100h: {
    icon: <Zap size={14} />,
    rawColor: "#fb923c",
    bgColor: "rgba(249,115,22,0.12)",
    borderColor: "rgba(249,115,22,0.25)",
    title: (n) => `${n.actor.name} 100 saat geçti 🎉`,
    body: (n) => n.game?.title ?? "",
    href: (n) =>
      n.metadata.actorLibraryEntryId
        ? `/games/${n.metadata.actorLibraryEntryId}`
        : null,
  },
  screenshot_added: {
    icon: <Camera size={14} />,
    rawColor: "#22d3ee",
    bgColor: "rgba(6,182,212,0.12)",
    borderColor: "rgba(6,182,212,0.25)",
    title: (n) => {
      const count = n.metadata.screenshotCount ?? 1;
      return `${n.actor.name} ${count > 1 ? `${count} ekran görüntüsü` : "ekran görüntüsü"} ekledi`;
    },
    body: (n) => n.game?.title ?? "",
    href: (n) =>
      n.metadata.actorLibraryEntryId
        ? `/games/${n.metadata.actorLibraryEntryId}`
        : null,
  },
};
