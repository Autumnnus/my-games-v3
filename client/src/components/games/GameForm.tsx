import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { GameListItem } from "@/api/types";
import type { AddGameInput } from "@/api/games.api";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassButton } from "@/components/ui/GlassButton";
import { RatingStars } from "@/components/ui/RatingStars";
import {
  ALL_PLATFORMS,
  ALL_STATUSES,
  PLATFORM_LABELS,
  STATUS_LABELS,
} from "@/lib/constants";
import { formatPlayTime } from "@/lib/formatters";

const schema = z.object({
  name: z.string().min(1, "Oyun adı gerekli").max(200),
  platform: z.enum([
    "steam",
    "epicGames",
    "ubisoft",
    "xboxPc",
    "eaGames",
    "torrent",
    "playstation",
    "xboxSeries",
    "nintendo",
    "mobile",
    "otherPlatforms",
  ]),
  status: z.enum(["completed", "abandoned", "toBeCompleted", "activePlaying"]),
  playTime: z.number().min(0, "Süre 0'dan küçük olamaz"),
  playTimeHours: z.number().min(0).optional(),
  playTimeMinutes: z.number().min(0).max(59).optional(),
  rating: z.number().min(0).max(10).optional(),
  review: z.string().max(2000).optional(),
  isFavorite: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface GameFormProps {
  defaultValues?: Partial<GameListItem>;
  onSubmit: (data: Partial<AddGameInput>) => void;
  isLoading?: boolean;
  submitLabel?: string;
}

export function GameForm({
  defaultValues,
  onSubmit,
  isLoading,
  submitLabel = "Kaydet",
}: GameFormProps) {
  const initialPlayTime = defaultValues?.playTime ?? 0;
  const initialHours = Math.floor(initialPlayTime / 60);
  const initialMinutes = initialPlayTime % 60;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    setValue,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      platform: defaultValues?.platform ?? "steam",
      status: defaultValues?.status ?? "activePlaying",
      playTime: initialPlayTime,
      playTimeHours: initialHours,
      playTimeMinutes: initialMinutes,
      rating: defaultValues?.rating ?? undefined,
      review: defaultValues?.review ?? "",
      isFavorite: defaultValues?.isFavorite ?? false,
    },
  });

  const totalMinutes = watch("playTime") ?? 0;

  const playTimeHours = watch("playTimeHours");
  const playTimeMinutes = watch("playTimeMinutes");

  useEffect(() => {
    const hours =
      typeof playTimeHours === "number" && Number.isFinite(playTimeHours)
        ? Math.max(0, Math.floor(playTimeHours))
        : 0;
    const minutes =
      typeof playTimeMinutes === "number" && Number.isFinite(playTimeMinutes)
        ? Math.max(0, Math.floor(playTimeMinutes))
        : 0;
    const normalizedMinutes = Math.min(minutes, 59);
    const calculatedTotal = hours * 60 + normalizedMinutes;
    setValue("playTime", calculatedTotal, {
      shouldValidate: true,
      shouldDirty: true,
    });

    if (minutes !== normalizedMinutes) {
      setValue("playTimeMinutes", normalizedMinutes, {
        shouldValidate: false,
        shouldDirty: true,
      });
    }
  }, [playTimeHours, playTimeMinutes, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <GlassInput
        label="Oyun Adı"
        placeholder="Oyun adı"
        error={errors.name?.message}
        {...register("name")}
      />

      <div className="grid grid-cols-2 gap-3">
        <GlassSelect
          label="Platform"
          options={ALL_PLATFORMS.map((p) => ({
            value: p,
            label: PLATFORM_LABELS[p],
          }))}
          error={errors.platform?.message}
          {...register("platform")}
        />
        <GlassSelect
          label="Durum"
          options={ALL_STATUSES.map((s) => ({
            value: s,
            label: STATUS_LABELS[s],
          }))}
          error={errors.status?.message}
          {...register("status")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          Oynama Süresi
        </label>
        <div className="grid grid-cols-2 gap-3">
          <GlassInput
            label="Saat"
            type="number"
            min={0}
            placeholder="0"
            {...register("playTimeHours", {
              valueAsNumber: true,
              setValueAs: (v) => {
                if (v === "" || v === null || v === undefined) return 0;
                const parsed = Number(v);
                return Number.isFinite(parsed)
                  ? Math.max(0, Math.floor(parsed))
                  : 0;
              },
            })}
          />
          <GlassInput
            label="Dakika"
            type="number"
            min={0}
            max={59}
            placeholder="0"
            error={errors.playTime?.message}
            {...register("playTimeMinutes", {
              valueAsNumber: true,
              setValueAs: (v) => {
                if (v === "" || v === null || v === undefined) return 0;
                const parsed = Number(v);
                if (!Number.isFinite(parsed)) return 0;
                return Math.min(59, Math.max(0, Math.floor(parsed)));
              },
            })}
          />
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          Toplam: {formatPlayTime(totalMinutes)} ({totalMinutes} dk)
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          Puan
        </label>
        <Controller
          name="rating"
          control={control}
          render={({ field }) => (
            <>
              <div className="flex items-center justify-between gap-3">
                <RatingStars
                  value={field.value ?? 0}
                  onChange={(v) => field.onChange(v)}
                />
                <div className="w-28">
                  <GlassInput
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    placeholder="0.0"
                    value={field.value ?? ""}
                    onBlur={field.onBlur}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        field.onChange(undefined);
                        return;
                      }
                      const parsed = Number(raw);
                      if (!Number.isFinite(parsed)) return;
                      const normalized = Math.min(
                        10,
                        Math.max(0, Math.round(parsed * 10) / 10),
                      );
                      field.onChange(normalized);
                    }}
                  />
                </div>
              </div>
              {errors.rating?.message && (
                <p className="text-xs text-red-400">{errors.rating.message}</p>
              )}
            </>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          İnceleme
        </label>
        <textarea
          className="glass-input px-3 py-2.5 text-sm resize-none"
          rows={3}
          placeholder="Oyun hakkında düşüncelerini yaz..."
          {...register("review")}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 rounded"
          {...register("isFavorite")}
        />
        <span className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
          Favorilere ekle
        </span>
      </label>

      <GlassButton
        type="submit"
        variant="primary"
        loading={isLoading}
        className="w-full mt-1"
      >
        {submitLabel}
      </GlassButton>
    </form>
  );
}
