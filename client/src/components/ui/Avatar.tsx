import { cn } from "@/lib/cn";

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

const ACCENT_COLORS = [
  "var(--theme-accent)",
  "var(--theme-accent-2)",
  "#ec4899",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function getAvatarColor(name: string) {
  return ACCENT_COLORS[name.charCodeAt(0) % ACCENT_COLORS.length];
}

export function Avatar({ src, name, size = "md", className = "" }: AvatarProps) {
  const sizeClass = SIZES[size];
  const color = getAvatarColor(name);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        decoding="async"
        className={cn(sizeClass, "rounded-full object-cover border border-glass-border", className)}
      />
    );
  }

  return (
    <div
      className={cn(sizeClass, "rounded-full flex items-center justify-center font-semibold border border-glass-border", className)}
      style={{ background: `${color}22`, color }}
    >
      {getInitials(name)}
    </div>
  );
}
