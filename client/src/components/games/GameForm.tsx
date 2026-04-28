import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import type { GameListItem } from "@/api/types";
import type { AddGameInput } from "@/api/games.api";
import { GlassInput } from "@/components/ui/GlassInput";
import { DateInputField } from "@/components/ui/DateInput";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassButton } from "@/components/ui/GlassButton";
import { RatingStars } from "@/components/ui/RatingStars";
import {
  ALL_PLATFORMS,
  ALL_STATUSES,
} from "@/lib/constants";
import { formatPlayTime } from "@/lib/formatters";

const schema = z.object({
  name: z.string().min(1, "Oyun adı gerekli").max(200),
  photo: z.string().url("Geçerli bir URL girin").optional().or(z.literal("")),
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
  lastPlayDate: z.string().optional(),
  completionDate: z.string().optional(),
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
  submitLabel,
}: GameFormProps) {
  const { t } = useTranslation();
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
      photo: defaultValues?.photo ?? "",
      platform: defaultValues?.platform ?? "steam",
      status: defaultValues?.status ?? "activePlaying",
      playTime: initialPlayTime,
      playTimeHours: initialHours,
      playTimeMinutes: initialMinutes,
      rating: defaultValues?.rating ?? undefined,
      review: defaultValues?.review ?? "",
      isFavorite: defaultValues?.isFavorite ?? false,
      lastPlayDate: defaultValues?.lastPlayDate ? String(defaultValues.lastPlayDate) : "",
      completionDate: defaultValues?.completionDate ? String(defaultValues.completionDate) : "",
    },
  });

  const currentStatus = watch("status");
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

  const showCompletionDate = currentStatus === "activePlaying" || currentStatus === "completed";

  useEffect(() => {
    if (!showCompletionDate) {
      setValue("completionDate", "", { shouldDirty: true });
    }
  }, [currentStatus, showCompletionDate, setValue]);

  const platformOptions = ALL_PLATFORMS.map((p) => ({
    value: p,
    label: t(`games.platform.${p}`),
  }));

  const statusOptions = ALL_STATUSES.map((s) => ({
    value: s,
    label: t(`games.status.${s}`),
  }));

  const displaySubmitLabel = submitLabel ?? t("common.buttons.save");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <GlassInput
        label={t("games.form.gameName")}
        placeholder={t("games.form.namePlaceholder")}
        error={errors.name?.message}
        {...register("name")}
      />

      <div className="flex flex-col gap-2">
        <GlassInput
          label={t("games.form.coverUrl")}
          placeholder={t("games.form.coverUrlPlaceholder")}
          error={errors.photo?.message}
          {...register("photo")}
        />
        {(() => {
          const fieldValue = watch("photo") ?? "";
          const [imgError, setImgError] = useState(false);
          if (!fieldValue || imgError) return null;
          return (
            <div className="relative w-24 h-32 rounded-lg overflow-hidden border border-white/10">
              <img
                src={fieldValue}
                alt="cover preview"
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            </div>
          );
        })()}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <GlassSelect
          label={t("games.form.platform")}
          options={platformOptions}
          error={errors.platform?.message}
          {...register("platform")}
        />
        <GlassSelect
          label={t("games.form.status")}
          options={statusOptions}
          error={errors.status?.message}
          {...register("status")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          {t("games.form.playTime")}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <GlassInput
            label={t("games.form.hoursLabel")}
            type="number"
            min={0}
            placeholder={t('games.form.hoursPlaceholder')}
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
            label={t("games.form.minutesLabel")}
            type="number"
            min={0}
            max={59}
            placeholder={t('games.form.minutesPlaceholder')}
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
          {t("games.form.totalTime", { time: formatPlayTime(totalMinutes), minutes: totalMinutes })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          {t("games.form.rating")}
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
                    placeholder={t('games.form.ratingPlaceholder')}
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
          {t("games.form.review")}
        </label>
        <textarea
          className="glass-input px-3 py-2.5 text-sm resize-none"
          rows={3}
          placeholder={t("games.form.reviewPlaceholder")}
          {...register("review")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DateInputField
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          control={control as any}
          name="lastPlayDate"
          label={t("games.form.lastPlayDate")}
          error={errors.lastPlayDate?.message as string | undefined}
        />
        {showCompletionDate && (
          <DateInputField
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            control={control as any}
            name="completionDate"
            label={t("games.form.completionDate")}
            error={errors.completionDate?.message as string | undefined}
          />
        )}
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 rounded"
          {...register("isFavorite")}
        />
        <span className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
          {t("games.form.addToFavorites")}
        </span>
      </label>

      <GlassButton
        type="submit"
        variant="primary"
        loading={isLoading}
        className="w-full mt-1"
      >
        {displaySubmitLabel}
      </GlassButton>
    </form>
  );
}
