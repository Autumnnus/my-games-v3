interface AvatarProps {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-20 h-20 text-2xl",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    "#a855f7",
    "#3b82f6",
    "#ec4899",
    "#f59e0b",
    "#22c55e",
    "#14b8a6",
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

export function Avatar({
  src,
  name,
  size = "md",
  className = "",
}: AvatarProps) {
  const sizeClass = SIZES[size];
  const color = getAvatarColor(name);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        decoding="async"
        className={`${sizeClass} rounded-full object-cover border border-white/10 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-semibold border border-white/10 ${className}`}
      style={{ background: `${color}33`, color }}
    >
      {getInitials(name)}
    </div>
  );
}
