import type { Platform } from "@my-games/shared";
import { PLATFORM_LABELS, PLATFORM_ICONS } from "@/lib/constants";

interface PlatformIconProps {
  platform: Platform;
  showLabel?: boolean;
  className?: string;
}

export function PlatformIcon({
  platform,
  showLabel = false,
  className = "",
}: PlatformIconProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${className}`}
      style={{ color: "rgba(255,255,255,0.5)" }}
      title={PLATFORM_LABELS[platform]}
    >
      <span>{PLATFORM_ICONS[platform]}</span>
      {showLabel && PLATFORM_LABELS[platform]}
    </span>
  );
}
