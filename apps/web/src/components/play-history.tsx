import type { EstimateIntensity, EstimatePattern } from "@my-games/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClockIcon, PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BAR } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SwitchField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, unwrap } from "@/lib/api";
import { errorMessage, formatDate, formatPlaytime } from "@/lib/format";
import { type EntryPlayHistory, entryPlayHistoryQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

type Estimate = NonNullable<EntryPlayHistory["estimate"]>;
type Period = { from: string; to: string; intensity: EstimateIntensity };

const patternLabels: Record<EstimatePattern, () => string> = {
  sampled: m.play_history_pattern_sampled,
  campaign: m.play_history_pattern_campaign,
  episodic: m.play_history_pattern_episodic,
  steady: m.play_history_pattern_steady,
  excluded: m.play_history_pattern_excluded,
};
const plannerLabels = {
  heuristic: m.play_history_planner_heuristic,
  ai: m.play_history_planner_ai,
  user: m.play_history_planner_user,
};
const intensityLabels: Record<EstimateIntensity, () => string> = {
  binge: m.play_history_intensity_binge,
  regular: m.play_history_intensity_regular,
  casual: m.play_history_intensity_casual,
};
const MAX_PERIODS = 6;
/** Tahmini çubuklar ısı haritasındaki gibi taralı: aynı renk, tahmin olduğu görünür. */
const HATCH = `repeating-linear-gradient(135deg, ${BAR} 0 2px, color-mix(in srgb, ${BAR} 30%, transparent) 2px 5px)`;

function confidenceLabel(value: number) {
  if (value < 0.45) return m.play_history_confidence_low();
  if (value < 0.7) return m.play_history_confidence_medium();
  return m.play_history_confidence_high();
}

/**
 * Kaydın oynama geçmişi: ay ay (üç yıldan uzunsa yıl yıl) gerçek süre ve takip başlamadan önceki tahmin
 * (taralı). Kaydın sahibi tahmini "ne zaman oynadım" bilgisiyle düzeltebilir.
 */
export function PlayHistory({ entryId, isOwner }: { entryId: string; isOwner: boolean }) {
  const history = useQuery(entryPlayHistoryQuery(entryId));
  const [fixing, setFixing] = useState(false);
  const data = history.data;
  if (!data || (data.months.length === 0 && !data.estimate)) return null;
  const { estimate } = data;
  const total = data.months.reduce((sum, month) => sum + month.minutes, 0);
  const estimated = data.months.reduce((sum, month) => sum + month.estimatedMinutes, 0);

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{m.play_history_title()}</h2>
        {isOwner && estimate && (
          <Button variant="glass" size="sm" onClick={() => setFixing(true)}>
            <CalendarClockIcon />
            {m.play_history_fix()}
          </Button>
        )}
      </div>
      {estimate && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Badge variant="secondary">{plannerLabels[estimate.planner]()}</Badge>
          <span>{patternLabels[estimate.pattern]()}</span>
          {estimate.planner !== "user" && <span>· {confidenceLabel(estimate.confidence)}</span>}
          {estimate.note && estimate.planner !== "user" && (
            <span className="text-foreground/75 basis-full italic">{estimate.note}</span>
          )}
        </div>
      )}
      {estimate?.pattern === "excluded" ? (
        <p className="text-muted-foreground text-sm">{m.play_history_excluded_hint()}</p>
      ) : (
        <>
          <HistoryChart months={data.months} />
          {estimated > 0 && (
            <p className="text-muted-foreground text-xs">
              {formatPlaytime(total)} ·{" "}
              {m.play_history_estimated_part({ time: formatPlaytime(estimated) })}
            </p>
          )}
        </>
      )}
      {isOwner && estimate && (
        <FixDialog entryId={entryId} estimate={estimate} open={fixing} onOpenChange={setFixing} />
      )}
    </section>
  );
}

type Bucket = { key: string; label: string; title: string; minutes: number; estimated: number };

/** Ayları çubuklara çevirir; üç yıldan uzun geçmiş yıl yıl gösterilir. Boş aylar da çubuk (sıfır) olur. */
function bucketsOf(months: EntryPlayHistory["months"]): Bucket[] {
  const first = months[0]?.month;
  const last = months.at(-1)?.month;
  if (!first || !last) return [];
  const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
  const locale = getLocale();
  if (index(last) - index(first) < 36) {
    const byMonth = new Map(months.map((month) => [month.month, month]));
    const short = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const buckets: Bucket[] = [];
    for (let cursor = index(first); cursor <= index(last); cursor++) {
      const year = Math.floor(cursor / 12);
      const key = `${year}-${String((cursor % 12) + 1).padStart(2, "0")}`;
      const date = new Date(Date.UTC(year, cursor % 12, 1));
      const item = byMonth.get(key);
      buckets.push({
        key,
        // Etiketler sıkışmasın: ilk çubukta ve her ocakta yıl, diğerlerinde ay.
        label:
          cursor === index(first) || cursor % 12 === 0
            ? `${short.format(date)} ${year}`
            : short.format(date),
        title: long.format(date),
        minutes: item?.minutes ?? 0,
        estimated: item?.estimatedMinutes ?? 0,
      });
    }
    return buckets;
  }
  const byYear = new Map<number, { minutes: number; estimated: number }>();
  for (const month of months) {
    const year = Number(month.month.slice(0, 4));
    const current = byYear.get(year) ?? { minutes: 0, estimated: 0 };
    byYear.set(year, {
      minutes: current.minutes + month.minutes,
      estimated: current.estimated + month.estimatedMinutes,
    });
  }
  const buckets: Bucket[] = [];
  for (let year = Number(first.slice(0, 4)); year <= Number(last.slice(0, 4)); year++) {
    const item = byYear.get(year);
    buckets.push({
      key: String(year),
      label: String(year),
      title: String(year),
      minutes: item?.minutes ?? 0,
      estimated: item?.estimated ?? 0,
    });
  }
  return buckets;
}

function HistoryChart({ months }: { months: EntryPlayHistory["months"] }) {
  const buckets = bucketsOf(months);
  if (buckets.length === 0) return null;
  const max = Math.max(1, ...buckets.map((bucket) => bucket.minutes));
  const height = 120;
  const describe = (bucket: Bucket) => {
    const time = formatPlaytime(bucket.minutes);
    if (bucket.estimated === 0) return m.stats_heatmap_cell({ date: bucket.title, time });
    if (bucket.estimated >= bucket.minutes) {
      return m.stats_heatmap_cell_estimated({ date: bucket.title, time });
    }
    return m.stats_heatmap_cell_partly({
      date: bucket.title,
      time,
      estimated: formatPlaytime(bucket.estimated),
    });
  };
  return (
    <div className="flex items-end gap-0.5" style={{ height: height + 20 }}>
      {buckets.map((bucket) => {
        const real = bucket.minutes - bucket.estimated;
        return (
          <div
            key={bucket.key}
            title={describe(bucket)}
            className="group flex max-w-10 min-w-0 flex-1 flex-col items-center gap-1"
          >
            <div className="flex w-full flex-1 flex-col justify-end overflow-hidden rounded-t-[4px] transition-opacity group-hover:opacity-80">
              {bucket.estimated > 0 && (
                <div
                  className="w-full"
                  style={{ height: (bucket.estimated / max) * height, background: HATCH }}
                />
              )}
              {real > 0 && (
                <div
                  className="w-full"
                  style={{ height: (real / max) * height, minHeight: 2, backgroundColor: BAR }}
                />
              )}
            </div>
            <span className="text-muted-foreground w-full truncate text-center text-[10px] tabular-nums">
              {bucket.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Tahminin fazları düzeltmenin başlangıcıdır: kullanıcı sıfırdan yazmaz, tahmini düzeltir. */
function initialPeriods(estimate: Estimate): Period[] {
  const { limits } = estimate;
  const periods = estimate.phases
    .filter((phase) => phase.to >= limits.from && phase.from <= limits.to)
    .slice(0, MAX_PERIODS)
    .map((phase) => ({
      from: phase.from < limits.from ? limits.from : phase.from,
      to: phase.to > limits.to ? limits.to : phase.to,
      intensity: phase.intensity,
    }));
  return periods.length > 0 ? periods : [defaultPeriod(estimate)];
}

const defaultPeriod = (estimate: Estimate): Period => ({
  from: addDays(estimate.limits.to, -60),
  to: estimate.limits.to,
  intensity: "regular",
});

function FixDialog(props: {
  entryId: string;
  estimate: Estimate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { estimate } = props;
  const queryClient = useQueryClient();
  const [excluded, setExcluded] = useState(estimate.pattern === "excluded");
  const [periods, setPeriods] = useState<Period[]>(() => initialPeriods(estimate));
  const { limits } = estimate;
  const valid =
    excluded ||
    (periods.length > 0 &&
      periods.every(
        (period) =>
          period.from &&
          period.to &&
          period.from <= period.to &&
          period.from >= limits.from &&
          period.to <= limits.to,
      ));

  const done = (data: EntryPlayHistory) => {
    queryClient.setQueryData(entryPlayHistoryQuery(props.entryId).queryKey, data);
    // Isı haritası, yıl özeti ve istatistikler aynı günlerden beslenir.
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
    void queryClient.invalidateQueries({ queryKey: ["wrapped"] });
    toast.success(m.play_history_saved());
    props.onOpenChange(false);
  };
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.library[":id"]["play-history"].$put({
          param: { id: props.entryId },
          json: { excluded, periods: excluded ? [] : periods },
        }),
      ),
    onSuccess: done,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const reset = useMutation({
    mutationFn: () =>
      unwrap(api.library[":id"]["play-history"].$delete({ param: { id: props.entryId } })),
    onSuccess: (data) => {
      done(data);
      if (data.estimate) {
        setExcluded(data.estimate.pattern === "excluded");
        setPeriods(initialPeriods(data.estimate));
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const update = (index: number, patch: Partial<Period>) =>
    setPeriods((current) =>
      current.map((period, position) => (position === index ? { ...period, ...patch } : period)),
    );

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.play_history_fix_title()}</DialogTitle>
          <DialogDescription>
            {m.play_history_fix_hint({ time: formatPlaytime(estimate.budgetMin) })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <SwitchField
            label={m.play_history_exclude()}
            description={m.play_history_exclude_hint()}
            checked={excluded}
            onCheckedChange={(checked) => {
              setExcluded(checked);
              if (!checked && periods.length === 0) setPeriods([defaultPeriod(estimate)]);
            }}
          />
          {!excluded && (
            <div className="grid gap-3">
              {periods.map((period, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: dönemlerin kimliği yok; sıra değişmez, yalnızca eklenir/silinir.
                  key={index}
                  className="grid gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"
                >
                  <Input
                    type="date"
                    aria-label={m.play_history_period_from()}
                    min={limits.from}
                    max={limits.to}
                    value={period.from}
                    onChange={(event) => update(index, { from: event.target.value })}
                  />
                  <Input
                    type="date"
                    aria-label={m.play_history_period_to()}
                    min={limits.from}
                    max={limits.to}
                    value={period.to}
                    onChange={(event) => update(index, { to: event.target.value })}
                  />
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    aria-label={m.play_history_intensity()}
                    value={period.intensity}
                    onValueChange={(value) =>
                      value && update(index, { intensity: value as EstimateIntensity })
                    }
                  >
                    {(["binge", "regular", "casual"] as const).map((intensity) => (
                      <ToggleGroupItem key={intensity} value={intensity}>
                        {intensityLabels[intensity]()}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={m.play_history_remove_period()}
                    disabled={periods.length === 1}
                    onClick={() =>
                      setPeriods((current) => current.filter((_, position) => position !== index))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              {periods.length < MAX_PERIODS && (
                <Button
                  variant="glass"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => setPeriods((current) => [...current, defaultPeriod(estimate)])}
                >
                  <PlusIcon />
                  {m.play_history_add_period()}
                </Button>
              )}
              {!valid && (
                <p className="text-destructive text-xs">
                  {m.play_history_invalid({
                    from: formatDate(limits.from) ?? limits.from,
                    to: formatDate(limits.to) ?? limits.to,
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {estimate.planner === "user" ? (
            <Button variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate()}>
              <Undo2Icon />
              {m.play_history_reset()}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="glass" onClick={() => props.onOpenChange(false)}>
              {m.action_cancel()}
            </Button>
            <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
              {m.action_save()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
