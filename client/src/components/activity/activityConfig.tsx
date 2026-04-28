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
import type { ActivityType } from "@my-games/shared";

export type ActivityFilter = ActivityType | "all";

interface ActivityConfigEntry {
  icon: React.ReactNode;
  rawColor: string;
  bgColor: string;
  borderColor: string;
  labelKey: string;
}

export const ACTIVITY_CONFIG: Record<ActivityType, ActivityConfigEntry> = {
  game_added: {
    icon: <Gamepad2 size={13} />,
    rawColor: "#60a5fa",
    bgColor: "rgba(59,130,246,0.12)",
    borderColor: "rgba(59,130,246,0.25)",
    labelKey: "activity.labels.game_added",
  },
  game_completed: {
    icon: <Trophy size={13} />,
    rawColor: "#facc15",
    bgColor: "rgba(234,179,8,0.12)",
    borderColor: "rgba(234,179,8,0.25)",
    labelKey: "activity.labels.game_completed",
  },
  game_abandoned: {
    icon: <XCircle size={13} />,
    rawColor: "#f87171",
    bgColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,0.25)",
    labelKey: "activity.labels.game_abandoned",
  },
  status_changed: {
    icon: <ArrowRight size={13} />,
    rawColor: "#c084fc",
    bgColor: "rgba(168,85,247,0.12)",
    borderColor: "rgba(168,85,247,0.25)",
    labelKey: "activity.labels.status_changed",
  },
  game_rated: {
    icon: <Star size={13} />,
    rawColor: "#fbbf24",
    bgColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.25)",
    labelKey: "activity.labels.game_rated",
  },
  game_reviewed: {
    icon: <MessageSquare size={13} />,
    rawColor: "#4ade80",
    bgColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.25)",
    labelKey: "activity.labels.game_reviewed",
  },
  screenshot_added: {
    icon: <Camera size={13} />,
    rawColor: "#22d3ee",
    bgColor: "rgba(6,182,212,0.12)",
    borderColor: "rgba(6,182,212,0.25)",
    labelKey: "activity.labels.screenshot_added",
  },
  game_favorited: {
    icon: <Heart size={13} />,
    rawColor: "#f472b6",
    bgColor: "rgba(236,72,153,0.12)",
    borderColor: "rgba(236,72,153,0.25)",
    labelKey: "activity.labels.game_favorited",
  },
  steam_synced: {
    icon: <Zap size={13} />,
    rawColor: "#38bdf8",
    bgColor: "rgba(14,165,233,0.12)",
    borderColor: "rgba(14,165,233,0.25)",
    labelKey: "activity.labels.steam_synced",
  },
  milestone_playtime: {
    icon: <Zap size={13} />,
    rawColor: "#fb923c",
    bgColor: "rgba(249,115,22,0.12)",
    borderColor: "rgba(249,115,22,0.25)",
    labelKey: "activity.labels.milestone_playtime",
  },
};

export const FILTER_OPTIONS: { labelKey: string; value: ActivityFilter }[] = [
  { labelKey: "activity.all", value: "all" },
  { labelKey: "activity.added", value: "game_added" },
  { labelKey: "activity.completed", value: "game_completed" },
  { labelKey: "activity.dropped", value: "game_abandoned" },
  { labelKey: "activity.rated", value: "game_rated" },
  { labelKey: "activity.reviewed", value: "game_reviewed" },
  { labelKey: "activity.screenshot", value: "screenshot_added" },
  { labelKey: "activity.steamSync", value: "steam_synced" },
  { labelKey: "activity.milestone", value: "milestone_playtime" },
];
