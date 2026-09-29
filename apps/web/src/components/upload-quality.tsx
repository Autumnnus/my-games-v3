import type { UploadQuality } from "@my-games/shared";
import { cn } from "cn";
import { useId } from "react";
import { m } from "@/paraglide/messages";

const options: Array<{ value: UploadQuality; title: () => string; hint: () => string }> = [
  {
    value: "optimized",
    title: m.upload_quality_optimized,
    hint: m.upload_quality_optimized_hint,
  },
  { value: "original", title: m.upload_quality_original, hint: m.upload_quality_original_hint },
];

/** Optimize / Orijinal seçimi (yükleme penceresi ve ayarlar). */
export function QualityPicker(props: {
  value: UploadQuality;
  onChange: (value: UploadQuality) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = props.value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "grid cursor-pointer gap-1 rounded-xl border p-3 transition-colors has-disabled:cursor-default has-disabled:opacity-60 has-focus-visible:ring-2 has-focus-visible:ring-ring",
              selected ? "border-primary bg-primary/10" : "hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              disabled={props.disabled}
              onChange={() => props.onChange(option.value)}
              className="sr-only"
            />
            <span className="text-sm font-semibold">{option.title()}</span>
            <span className="text-muted-foreground text-xs leading-snug">{option.hint()}</span>
          </label>
        );
      })}
    </div>
  );
}
