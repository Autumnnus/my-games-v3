import {
  type EntryStatus,
  entryStatuses,
  type Platform,
  platforms,
  type Store,
  stores,
} from "@my-games/shared";
import { cn } from "cn";
import { StarIcon } from "lucide-react";
import { type CSSProperties, type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, FormSection, SwitchField, useField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPlaytime, platformLabel, statusLabel, storeLabel } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

export type EntryFormValues = {
  status: EntryStatus;
  rating: number | null;
  playtimeMin: number;
  platform: Platform | null;
  store: Store | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** Alan değişmediyse gönderilmez; API'de "dokunma" demektir. */
  lastPlayedAt?: string | null;
  isFavorite: boolean;
  review: string | null;
};

/** Platformların bildirdiği süre; elle girilen değer bunun üstüne eklenir. */
function platformHint(initial: EntryFormInitial) {
  const steam = initial.playtimeSteamMin ?? 0;
  const others = (initial.playtimePsnMin ?? 0) + (initial.playtimeXboxMin ?? 0);
  if (!steam && !others) return undefined;
  return others
    ? m.field_playtime_platforms({ time: formatPlaytime(steam + others) })
    : m.field_playtime_steam({ time: formatPlaytime(steam) });
}

export type EntryFormInitial = Partial<{
  status: EntryStatus;
  rating: number | null;
  playtimeManualMin: number;
  playtimeSteamMin: number | null;
  playtimePsnMin: number | null;
  playtimeXboxMin: number | null;
  platform: Platform | null;
  store: Store | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastPlayedAt: string | Date | null;
  isFavorite: boolean;
  review: string | null;
}>;

const NONE = "__none";

// Kütüphane ızgarasıyla aynı durum renkleri; bitirdim/sonsuz orada noktasız, burada nötr.
const statusDot: Record<EntryStatus, string> = {
  playing: "bg-live",
  completed: "bg-foreground/40 group-data-[state=on]/chip:bg-background/45",
  paused: "bg-amber-300",
  backlog: "bg-sky-300",
  wishlist: "bg-violet-300",
  dropped: "bg-destructive",
  endless: "bg-foreground/40 group-data-[state=on]/chip:bg-background/45",
};

/** Zaman damgasını yerel takvim gününe çevirir (UTC dilimi gece geç oynananları bir gün kaydırırdı). */
function localDay(value: string | Date) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "7,5" / "7.5" → 0–10 arası tek ondalıklı sayı; boş ya da geçersizse null. */
function parseRating(value: string) {
  const number = Number(value.replace(",", "."));
  if (value.trim() === "" || !Number.isFinite(number)) return null;
  return Math.round(Math.min(10, Math.max(0, number)) * 10) / 10;
}

/** Kutuda sitenin geri kalanı gibi yerel ondalık ayırıcı görünür ("7,5"). */
function ratingText(value: number | null) {
  if (value === null) return "";
  return getLocale() === "tr" ? String(value).replace(".", ",") : String(value);
}

function StatusPicker(props: { value: EntryStatus; onChange: (value: EntryStatus) => void }) {
  const field = useField();
  return (
    <ToggleGroup
      type="single"
      variant="chips"
      value={props.value}
      // Tek seçimli grup etkin öğeye tıklanınca boşalır; durum her zaman dolu kalmalı.
      onValueChange={(value) => value && props.onChange(value as EntryStatus)}
      aria-labelledby={field?.labelId}
    >
      {entryStatuses.map((status) => (
        <ToggleGroupItem key={status} value={status} className="group/chip pr-3.5 pl-3">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full transition-colors", statusDot[status])}
          />
          {statusLabel(status)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Kaydırıcı ile sayı kutusu aynı değeri paylaşır; boş bırakmak "puansız" demektir. */
function RatingControl(props: { value: string; onChange: (value: string) => void }) {
  const rating = parseRating(props.value);
  const fill = `${(rating ?? 0) * 10}%`;
  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        min={0}
        max={10}
        step={0.1}
        value={rating ?? 0}
        aria-label={m.field_rating()}
        onChange={(event) => props.onChange(ratingText(Number(event.target.value)))}
        style={{ "--fill": fill } as CSSProperties}
        className={cn(
          "h-6 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent outline-none",
          "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-foreground)_var(--fill),rgb(255_255_255/0.1)_var(--fill))]",
          "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/10 [&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-foreground",
          "[&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:size-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-popover [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgb(0_0_0/0.5)] [&::-webkit-slider-thumb]:transition-[scale,box-shadow] [&::-webkit-slider-thumb]:duration-150 hover:[&::-webkit-slider-thumb]:scale-110 focus-visible:[&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgb(255_255_255/0.3)]",
          "[&::-moz-range-thumb]:size-[22px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-popover [&::-moz-range-thumb]:shadow-[0_2px_8px_rgb(0_0_0/0.5)] focus-visible:[&::-moz-range-thumb]:shadow-[0_0_0_3px_rgb(255_255_255/0.3)]",
          // Puansızken başparmak soluk: değer 0 değil, boş.
          rating === null
            ? "[&::-moz-range-thumb]:bg-foreground/45 [&::-webkit-slider-thumb]:bg-foreground/45"
            : "[&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:bg-foreground",
        )}
      />
      <Input
        name="rating"
        inputMode="decimal"
        autoComplete="off"
        placeholder="–"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value.replace(/[^\d.,]/g, "").slice(0, 4))}
        onBlur={() => props.onChange(ratingText(rating))}
        className="w-[92px] shrink-0"
        inputClassName="font-display pr-1 text-right text-lg font-semibold tabular-nums md:text-lg"
        trailing={<span className="text-foreground/40 font-semibold">/10</span>}
      />
    </div>
  );
}

/** Kütüphane kaydı ekleme ve düzenleme formu. Puan 0–10 girilir, API'ye 0–10 olarak gider. */
export function EntryForm(props: {
  initial?: EntryFormInitial;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: EntryFormValues) => void;
  onCancel?: () => void;
}) {
  const initial = props.initial ?? {};
  const [status, setStatus] = useState<EntryStatus>(initial.status ?? "completed");
  const [rating, setRating] = useState(() =>
    ratingText(
      initial.rating === null || initial.rating === undefined ? null : initial.rating / 10,
    ),
  );
  const [platform, setPlatform] = useState<string>(initial.platform ?? NONE);
  const [store, setStore] = useState<string>(initial.store ?? NONE);
  const [isFavorite, setFavorite] = useState(initial.isFavorite ?? false);

  const lastPlayed = initial.lastPlayedAt ? localDay(initial.lastPlayedAt) : "";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      return value ? value : null;
    };
    const hours = Number(String(form.get("playtime") ?? "0").replace(",", ".")) || 0;
    const lastPlayedAt = text("lastPlayedAt");
    props.onSubmit({
      status,
      rating: parseRating(rating),
      playtimeMin: Math.round(hours * 60),
      platform: platform === NONE ? null : (platform as Platform),
      store: store === NONE ? null : (store as Store),
      startedAt: text("startedAt"),
      finishedAt: text("finishedAt"),
      // Yalnızca gün seçilebildiği için dokunulmayan alan geri yazılmaz; yoksa saat bilgisi silinirdi.
      ...((lastPlayedAt ?? "") !== lastPlayed && {
        lastPlayedAt: lastPlayedAt ? new Date(`${lastPlayedAt}T12:00:00`).toISOString() : null,
      }),
      isFavorite,
      review: text("review"),
    });
  }

  return (
    <form className="grid gap-7" onSubmit={submit}>
      <div className="grid gap-5">
        <FormField label={m.field_status()}>
          <StatusPicker value={status} onChange={setStatus} />
        </FormField>
        <FormField
          label={m.field_rating()}
          aside={
            rating !== "" && (
              <button
                type="button"
                onClick={() => setRating("")}
                aria-label={m.field_rating_clear()}
                className="hover:text-foreground focus-visible:ring-ring/50 rounded-md font-semibold transition-colors outline-none focus-visible:ring-[3px]"
              >
                {m.field_clear()}
              </button>
            )
          }
        >
          <RatingControl value={rating} onChange={setRating} />
        </FormField>
      </div>

      <FormSection title={m.entry_form_section_time()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={m.field_playtime_hours()} hint={platformHint(initial)}>
            <Input
              name="playtime"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              placeholder="0"
              defaultValue={
                initial.playtimeManualMin
                  ? Math.round((initial.playtimeManualMin / 60) * 10) / 10
                  : ""
              }
            />
          </FormField>
          <FormField label={m.field_last_played()}>
            <Input name="lastPlayedAt" type="date" defaultValue={lastPlayed} />
          </FormField>
          <FormField label={m.field_started_at()}>
            <Input name="startedAt" type="date" defaultValue={initial.startedAt ?? ""} />
          </FormField>
          <FormField label={m.field_finished_at()}>
            <Input name="finishedAt" type="date" defaultValue={initial.finishedAt ?? ""} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title={m.entry_form_section_where()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={m.field_platform()}>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{m.field_none()}</SelectItem>
                {platforms.map((value) => (
                  <SelectItem key={value} value={value}>
                    {platformLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={m.field_store()}>
            <Select value={store} onValueChange={setStore}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{m.field_none()}</SelectItem>
                {stores.map((value) => (
                  <SelectItem key={value} value={value}>
                    {storeLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </FormSection>

      <div className="grid gap-4">
        <FormField label={m.field_review()}>
          <Textarea
            name="review"
            rows={5}
            maxLength={20_000}
            defaultValue={initial.review ?? ""}
            className="max-h-[50dvh] min-h-36"
          />
        </FormField>
        <SwitchField
          icon={
            <StarIcon
              className={cn("transition-colors", isFavorite && "fill-yellow-400 text-yellow-400")}
            />
          }
          label={m.field_favorite()}
          description={m.field_favorite_hint()}
          checked={isFavorite}
          onCheckedChange={setFavorite}
        />
      </div>

      {/* Diyalog içindeyse eylemler kaydırırken altta sabit kalır (diyaloğun p-6 boşluğuna taşar). */}
      <div className="in-data-[slot=dialog-content]:bg-popover/90 flex justify-end gap-2 in-data-[slot=dialog-content]:sticky in-data-[slot=dialog-content]:-bottom-6 in-data-[slot=dialog-content]:z-10 in-data-[slot=dialog-content]:-mx-6 in-data-[slot=dialog-content]:-mt-3 in-data-[slot=dialog-content]:-mb-6 in-data-[slot=dialog-content]:rounded-b-[26px] in-data-[slot=dialog-content]:border-t in-data-[slot=dialog-content]:border-white/8 in-data-[slot=dialog-content]:px-6 in-data-[slot=dialog-content]:py-4 in-data-[slot=dialog-content]:backdrop-blur-xl">
        {props.onCancel && (
          <Button type="button" variant="ghost" onClick={props.onCancel}>
            {m.action_cancel()}
          </Button>
        )}
        <Button type="submit" className="px-5" disabled={props.submitting}>
          {props.submitLabel}
        </Button>
      </div>
    </form>
  );
}
