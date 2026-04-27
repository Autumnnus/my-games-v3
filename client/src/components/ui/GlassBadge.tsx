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
        background: color ? `${color}22` : "rgba(255,255,255,0.08)",
        border: `1px solid ${color ? `${color}44` : "rgba(255,255,255,0.12)"}`,
        color: color ?? "rgba(255,255,255,0.75)",
      }}
    >
      {children}
    </span>
  );
}
