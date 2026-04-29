import type { SyncStatus } from "@/api/steamSync";

interface SyncStatusBadgeProps {
  syncStatus: SyncStatus | undefined;
  className?: string;
}

const CONFIG: Record<
  SyncStatus,
  { label: string; icon: string; color: string; bg: string; border: string }
> = {
  synced: {
    label: "Synced",
    icon: "✓",
    color: "rgba(74,222,128,0.9)",
    bg: "rgba(74,222,128,0.1)",
    border: "rgba(74,222,128,0.3)",
  },
  draft: {
    label: "Conflict",
    icon: "⚠",
    color: "rgba(251,191,36,0.9)",
    bg: "rgba(251,191,36,0.1)",
    border: "rgba(251,191,36,0.3)",
  },
  conflict: {
    label: "Conflict",
    icon: "⚠",
    color: "rgba(251,191,36,0.9)",
    bg: "rgba(251,191,36,0.1)",
    border: "rgba(251,191,36,0.3)",
  },
  resolved: {
    label: "Resolved",
    icon: "✓",
    color: "rgba(74,222,128,0.9)",
    bg: "rgba(74,222,128,0.1)",
    border: "rgba(74,222,128,0.3)",
  },
  excluded: {
    label: "Excluded",
    icon: "🚫",
    color: "var(--theme-text-muted)",
    bg: "var(--theme-surface-subtle)",
    border: "var(--theme-glass-border)",
  },
};

export function SyncStatusBadge({
  syncStatus,
  className = "",
}: SyncStatusBadgeProps) {
  if (!syncStatus || syncStatus === "synced") return null;

  const cfg = CONFIG[syncStatus] ?? CONFIG.synced;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${className}`}
      style={{
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  );
}
