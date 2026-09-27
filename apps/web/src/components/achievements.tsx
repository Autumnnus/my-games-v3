import { useQuery } from "@tanstack/react-query";
import { LockIcon } from "lucide-react";
import { useState } from "react";
import { DateText } from "@/components/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type AchievementSet, entryAchievementsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const providerLabels: Record<string, () => string> = {
  steam: m.provider_steam,
  psn: m.provider_psn,
  xbox: m.provider_xbox,
};

const trophyLabels: Record<string, () => string> = {
  platinum: m.trophy_platinum,
  gold: m.trophy_gold,
  silver: m.trophy_silver,
  bronze: m.trophy_bronze,
};

const COLLAPSED = 12;

function gradeLabel(provider: string, grade: string | null) {
  if (!grade) return null;
  if (provider === "psn") return trophyLabels[grade]?.() ?? grade;
  if (provider === "xbox") return `${grade}G`;
  return null;
}

function formatRarity(value: number) {
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}

function AchievementList({ set }: { set: AchievementSet }) {
  const [expanded, setExpanded] = useState(false);
  const items = expanded ? set.items : set.items.slice(0, COLLAPSED);
  const percent = set.total ? Math.round((set.unlocked / set.total) * 100) : 0;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="secondary">
          {(providerLabels[set.provider] ?? (() => set.provider))()}
        </Badge>
        <span className="text-muted-foreground">
          {m.achievements_progress({ unlocked: set.unlocked, total: set.total })}
        </span>
        <div
          className="bg-muted h-1.5 min-w-24 flex-1 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="bg-primary h-full rounded-full" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const grade = gradeLabel(set.provider, item.grade);
          const hiddenLocked = item.hidden && !item.unlocked;
          return (
            <li
              key={item.apiName}
              className={`flex gap-3 rounded-md border p-2 ${item.unlocked ? "" : "opacity-60"}`}
            >
              {item.iconUrl && !hiddenLocked ? (
                <img
                  src={item.iconUrl}
                  alt=""
                  loading="lazy"
                  className={`size-12 shrink-0 rounded ${item.unlocked ? "" : "grayscale"}`}
                />
              ) : (
                <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded">
                  <LockIcon className="text-muted-foreground size-4" />
                </div>
              )}
              <div className="grid min-w-0 flex-1 content-start gap-0.5 text-sm">
                <span className="font-medium">
                  {hiddenLocked ? m.achievements_hidden() : item.name}
                </span>
                {item.description && (
                  <span className="text-muted-foreground line-clamp-2 text-xs">
                    {item.description}
                  </span>
                )}
                <span className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                  {item.unlocked ? (
                    <DateText value={item.unlockedAt} />
                  ) : (
                    <span>{m.achievements_locked()}</span>
                  )}
                  {item.rarity !== null && (
                    <span>{m.achievements_rarity({ percent: formatRarity(item.rarity) })}</span>
                  )}
                  {grade && <span>{grade}</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {set.items.length > COLLAPSED && (
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => setExpanded(!expanded)}>
          {expanded
            ? m.achievements_show_less()
            : m.achievements_show_all({ count: set.items.length })}
        </Button>
      )}
    </div>
  );
}

/** Kaydın platform başarımları (Steam/PSN/Xbox); hiç set yoksa bölüm gösterilmez. */
export function EntryAchievements({ entryId }: { entryId: string }) {
  const achievements = useQuery(entryAchievementsQuery(entryId));
  const sets = achievements.data?.sets ?? [];
  if (sets.length === 0) return null;
  return (
    <section className="grid gap-4">
      <h2 className="font-semibold">{m.achievements_title()}</h2>
      {sets.map((set) => (
        <AchievementList key={`${set.provider}:${set.gameKey}`} set={set} />
      ))}
    </section>
  );
}
