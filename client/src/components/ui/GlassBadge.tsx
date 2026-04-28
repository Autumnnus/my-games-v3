interface GlassBadgeProps {
  children: React.ReactNode;
  color?: string;
  className?: string;
}

export function GlassBadge({
  children,
  color,
  className = "",
}: GlassBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
      style={{
        background: color ? `${color}22` : "var(--theme-glass-surface)",
        border: `1px solid ${color ? `${color}44` : "var(--theme-glass-border)"}`,
        color: color ?? "var(--theme-text-secondary)",
      }}
    >
      {children}
    </span>
  );
}
