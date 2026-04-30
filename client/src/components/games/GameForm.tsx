import type { AddGameInput } from "@/api/games.api";
import type { GameListItem } from "@/api/types";
import { DateInputField } from "@/components/ui/DateInput";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassSwitch } from "@/components/ui/GlassSwitch";
import { GlassTextarea } from "@/components/ui/GlassTextarea";
import { RatingStars } from "@/components/ui/RatingStars";
import { ALL_PLATFORMS, ALL_STATUSES } from "@/lib/constants";
import { formatPlayTime } from "@/lib/formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

function makeSchema(t: TFunction<"translation", undefined>) {
  return z.object({
    name: z.string().min(1, t("translation:validation.nameRequired")).max(200),
    photo: z
      .string()
      .url(t("translation:validation.invalidUrl"))
      .optional()
      .or(z.literal("")),
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
    status: z.enum([
      "completed",
      "abandoned",
      "toBeCompleted",
      "activePlaying",
    ]),
    playTime: z.number().min(0, t("translation:validation.minPlayTime")),
    playTimeHours: z.number().min(0).optional(),
    playTimeMinutes: z.number().min(0).max(59).optional(),
    rating: z.number().min(0).max(10).optional(),
    review: z.string().max(2000).optional(),
    isFavorite: z.boolean(),
    lastPlayDate: z.string().optional(),
    completionDate: z.string().optional(),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

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
  const schema = makeSchema(t);
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
      lastPlayDate: defaultValues?.lastPlayDate
        ? String(defaultValues.lastPlayDate)
        : "",
      completionDate: defaultValues?.completionDate
        ? String(defaultValues.completionDate)
        : "",
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
    setValue("playTime", hours * 60 + normalizedMinutes, {
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

  const showCompletionDate =
    currentStatus === "activePlaying" || currentStatus === "completed";

  useEffect(() => {
    if (!showCompletionDate)
      setValue("completionDate", "", { shouldDirty: true });
  }, [currentStatus, showCompletionDate, setValue]);

  const platformOptions = ALL_PLATFORMS.map((p) => ({
    value: p,
    label: t(`translation:games.platform.${p}`),
  }));
  const statusOptions = ALL_STATUSES.map((s) => ({
    value: s,
    label: t(`translation:games.status.${s}`),
  }));
  const displaySubmitLabel =
    submitLabel ?? t("translation:common.buttons.save");

  function handleFormSubmit(data: FormData) {
    const cleaned: Partial<AddGameInput> = {
      ...data,
      lastPlayDate: data.lastPlayDate || undefined,
      completionDate: data.completionDate || undefined,
    };
    onSubmit(cleaned);
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-4">
      {/* Game name */}
      <GlassInput
        label={t("translation:games.form.gameName")}
        placeholder={t("translation:games.form.namePlaceholder")}
        error={errors.name?.message}
        {...register("name")}
      />

      {/* Cover URL + preview */}
      <div className="flex flex-col gap-2">
        <GlassInput
          label={t("translation:games.form.coverUrl")}
          placeholder={t("translation:games.form.coverUrlPlaceholder")}
          error={errors.photo?.message}
          {...register("photo")}
        />
        {(() => {
          const fieldValue = watch("photo") ?? "";
          const [imgError, setImgError] = useState(false);
          if (!fieldValue || imgError) return null;
          return (
            <div className="relative w-24 h-32 rounded-lg overflow-hidden border border-glass-border">
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

      {/* Platform + Status */}
      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="platform"
          render={({ field }) => (
            <GlassSelect
              label={t("translation:games.form.platform")}
              options={platformOptions}
              error={errors.platform?.message}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <GlassSelect
              label={t("translation:games.form.status")}
              options={statusOptions}
              error={errors.status?.message}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      {/* Play time */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">
          {t("translation:games.form.playTime")}
        </span>
        <div className="grid grid-cols-2 gap-3">
          <GlassInput
            label={t("translation:games.form.hoursLabel")}
            type="number"
            min={0}
            placeholder={t("translation:games.form.hoursPlaceholder")}
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
            label={t("translation:games.form.minutesLabel")}
            type="number"
            min={0}
            max={59}
            placeholder={t("translation:games.form.minutesPlaceholder")}
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
        <p className="text-xs text-text-muted">
          {t("translation:games.form.totalTime", {
            time: formatPlayTime(totalMinutes),
            minutes: totalMinutes,
          })}
        </p>
      </div>

      {/* Rating */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text-secondary">
          {t("translation:games.form.rating")}
        </span>
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
                    placeholder={t("translation:games.form.ratingPlaceholder")}
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
                      field.onChange(
                        Math.min(10, Math.max(0, Math.round(parsed * 10) / 10)),
                      );
                    }}
                  />
                </div>
              </div>
              {errors.rating?.message && (
                <p className="text-xs text-danger">{errors.rating.message}</p>
              )}
            </>
          )}
        />
      </div>

      {/* Review */}
      <GlassTextarea
        label={t("translation:games.form.review")}
        rows={3}
        placeholder={t("translation:games.form.reviewPlaceholder")}
        error={errors.review?.message}
        {...register("review")}
      />

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <DateInputField
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          control={control as any}
          name="lastPlayDate"
          label={t("translation:games.form.lastPlayDate")}
          error={errors.lastPlayDate?.message as string | undefined}
        />
        {showCompletionDate && (
          <DateInputField
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            control={control as any}
            name="completionDate"
            label={t("translation:games.form.completionDate")}
            error={errors.completionDate?.message as string | undefined}
          />
        )}
      </div>

      {/* Favorite toggle */}
      <Controller
        control={control}
        name="isFavorite"
        render={({ field }) => (
          <label className="flex items-center gap-3 cursor-pointer">
            <GlassSwitch checked={field.value} onChange={field.onChange} />
            <span className="text-sm text-text-secondary">
              {t("translation:games.form.addToFavorites")}
            </span>
          </label>
        )}
      />

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
