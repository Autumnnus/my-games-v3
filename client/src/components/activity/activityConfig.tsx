import {
  Gamepad2,
  Trophy,
  XCircle,
  ArrowRight,
  Star,
  MessageSquare,
  Camera,
  Heart,
  Zap,
} from "lucide-react";
import type { ActivityType, Activity } from "@my-games/shared";

const STATUS_LABELS: Record<string, string> = {
  completed: "Tamamlandı",
  abandoned: "Bırakıldı",
  toBeCompleted: "Oynayacak",
  activePlaying: "Oynuyor",
};

interface ActivityConfigEntry {
  icon: React.ReactNode;
  rawColor: string;
  bgColor: string;
  borderColor: string;
  label: (a: Activity) => string;
}

export const ACTIVITY_CONFIG: Record<ActivityType, ActivityConfigEntry> = {
  game_added: {
    icon: <Gamepad2 size={13} />,
    rawColor: "#60a5fa",
    bgColor: "rgba(59,130,246,0.12)",
    borderColor: "rgba(59,130,246,0.25)",
    label: (a) => {
      const p = a.metadata.platform;
      return p ? `kütüphaneye ekledi · ${p}` : "kütüphaneye ekledi";
    },
  },
  game_completed: {
    icon: <Trophy size={13} />,
    rawColor: "#facc15",
    bgColor: "rgba(234,179,8,0.12)",
    borderColor: "rgba(234,179,8,0.25)",
    label: (a) => {
      const mins = a.metadata.playTimeMinutes;
      const hours = mins ? ` · ${Math.round(mins / 60)}s` : "";
      return `tamamladı${hours}`;
    },
  },
  game_abandoned: {
    icon: <XCircle size={13} />,
    rawColor: "#f87171",
    bgColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,0.25)",
    label: () => "bıraktı",
  },
  status_changed: {
    icon: <ArrowRight size={13} />,
    rawColor: "#c084fc",
    bgColor: "rgba(168,85,247,0.12)",
    borderColor: "rgba(168,85,247,0.25)",
    label: (a) => {
      const from =
        STATUS_LABELS[a.metadata.fromStatus ?? ""] ??
        a.metadata.fromStatus ??
        "?";
      const to =
        STATUS_LABELS[a.metadata.toStatus ?? ""] ?? a.metadata.toStatus ?? "?";
      return `${from} → ${to}`;
    },
  },
  game_rated: {
    icon: <Star size={13} />,
    rawColor: "#fbbf24",
    bgColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.25)",
    label: (a) => `${a.metadata.rating}/10 puan verdi`,
  },
  game_reviewed: {
    icon: <MessageSquare size={13} />,
    rawColor: "#4ade80",
    bgColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.25)",
    label: () => "inceleme yazdı",
  },
  screenshot_added: {
    icon: <Camera size={13} />,
    rawColor: "#22d3ee",
    bgColor: "rgba(6,182,212,0.12)",
    borderColor: "rgba(6,182,212,0.25)",
    label: (a) => {
      const n = a.metadata.screenshotCount ?? 1;
      return n > 1 ? `${n} ekran görüntüsü ekledi` : "ekran görüntüsü ekledi";
    },
  },
  game_favorited: {
    icon: <Heart size={13} />,
    rawColor: "#f472b6",
    bgColor: "rgba(236,72,153,0.12)",
    borderColor: "rgba(236,72,153,0.25)",
    label: () => "favorilere ekledi",
  },
  steam_synced: {
    icon: <Zap size={13} />,
    rawColor: "#38bdf8",
    bgColor: "rgba(14,165,233,0.12)",
    borderColor: "rgba(14,165,233,0.25)",
    label: (a) => {
      const n = a.metadata.gamesAdded ?? 0;
      return `Steam sync · ${n} oyun`;
    },
  },
  milestone_playtime: {
    icon: <Zap size={13} />,
    rawColor: "#fb923c",
    bgColor: "rgba(249,115,22,0.12)",
    borderColor: "rgba(249,115,22,0.25)",
    label: (a) => `${a.metadata.hours} saat oynadı 🎉`,
  },
};

export type ActivityFilter = ActivityType | "all";

export const FILTER_OPTIONS: { label: string; value: ActivityFilter }[] = [
  { label: "Tümü", value: "all" },
  { label: "Eklendi", value: "game_added" },
  { label: "Tamamlandı", value: "game_completed" },
  { label: "Bırakıldı", value: "game_abandoned" },
  { label: "Puan", value: "game_rated" },
  { label: "İnceleme", value: "game_reviewed" },
  { label: "Ekran Görüntüsü", value: "screenshot_added" },
  { label: "Steam", value: "steam_synced" },
  { label: "Milestone", value: "milestone_playtime" },
];
