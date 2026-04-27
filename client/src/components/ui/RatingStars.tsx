import { Star } from "lucide-react";

interface RatingStarsProps {
  value?: number;
  max?: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md";
}

export function RatingStars({
  value = 0,
  max = 10,
  onChange,
  readonly = false,
  size = "md",
}: RatingStarsProps) {
  const starCount = 5;
  const filled = Math.round((value / max) * starCount);
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <div
      className="flex items-center gap-0.5"
      role={readonly ? undefined : "group"}
      aria-label={`Puan: ${value}/${max}`}
    >
      {Array.from({ length: starCount }, (_, i) => {
        const starValue = Math.round(((i + 1) / starCount) * max);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange?.(starValue)}
            disabled={readonly}
            className={`transition-transform ${readonly ? "cursor-default" : "hover:scale-110 cursor-pointer"}`}
            aria-label={readonly ? undefined : `${starValue} puan ver`}
          >
            <Star
              size={iconSize}
              className={
                i < filled ? "fill-yellow-400 text-yellow-400" : "text-white/20"
              }
            />
          </button>
        );
      })}
      {value > 0 && (
        <span
          className="ml-1 text-xs"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          {value}/{max}
        </span>
      )}
    </div>
  );
}
