import {
  type EntryStatus,
  entryStatuses,
  type Platform,
  platforms,
  type Store,
  stores,
} from "@my-games/shared";
import { type FormEvent, useState } from "react";
import { FormField } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatPlaytime, platformLabel, statusLabel, storeLabel } from "@/lib/format";
import { m } from "@/paraglide/messages";

export type EntryFormValues = {
  status: EntryStatus;
  rating: number | null;
  playtimeMin: number;
  platform: Platform | null;
  store: Store | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastPlayedAt: string | null;
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
  const [platform, setPlatform] = useState<string>(initial.platform ?? NONE);
  const [store, setStore] = useState<string>(initial.store ?? NONE);
  const [isFavorite, setFavorite] = useState(initial.isFavorite ?? false);

  const lastPlayed = initial.lastPlayedAt
    ? new Date(initial.lastPlayedAt).toISOString().slice(0, 10)
    : "";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      return value ? value : null;
    };
    const rating = text("rating");
    const hours = Number(String(form.get("playtime") ?? "0").replace(",", ".")) || 0;
    const lastPlayedAt = text("lastPlayedAt");
    props.onSubmit({
      status,
      rating: rating === null ? null : Math.min(10, Math.max(0, Number(rating.replace(",", ".")))),
      playtimeMin: Math.round(hours * 60),
      platform: platform === NONE ? null : (platform as Platform),
      store: store === NONE ? null : (store as Store),
      startedAt: text("startedAt"),
      finishedAt: text("finishedAt"),
      lastPlayedAt: lastPlayedAt ? new Date(`${lastPlayedAt}T12:00:00`).toISOString() : null,
      isFavorite,
      review: text("review"),
    });
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={m.field_status()}>
          <Select value={status} onValueChange={(value) => setStatus(value as EntryStatus)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entryStatuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {statusLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={m.field_rating()}>
          <Input
            name="rating"
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step={0.1}
            defaultValue={
              initial.rating === null || initial.rating === undefined ? "" : initial.rating / 10
            }
          />
        </FormField>
        <FormField label={m.field_playtime_hours()} hint={platformHint(initial)}>
          <Input
            name="playtime"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
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
        <FormField label={m.field_started_at()}>
          <Input name="startedAt" type="date" defaultValue={initial.startedAt ?? ""} />
        </FormField>
        <FormField label={m.field_finished_at()}>
          <Input name="finishedAt" type="date" defaultValue={initial.finishedAt ?? ""} />
        </FormField>
      </div>
      <FormField label={m.field_review()}>
        <Textarea name="review" rows={5} maxLength={20_000} defaultValue={initial.review ?? ""} />
      </FormField>
      <div className="flex items-center justify-between gap-4">
        {/* biome-ignore lint/a11y/noLabelWithoutControl: Switch label içinde */}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={isFavorite} onCheckedChange={setFavorite} />
          {m.field_favorite()}
        </label>
        <div className="flex gap-2">
          {props.onCancel && (
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              {m.action_cancel()}
            </Button>
          )}
          <Button type="submit" disabled={props.submitting}>
            {props.submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
