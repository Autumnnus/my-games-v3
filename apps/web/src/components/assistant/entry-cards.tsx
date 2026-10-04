import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  NotebookPenIcon,
  PencilLineIcon,
  TrophyIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { recapQuery } from "@/lib/assistant";
import { formatDate, formatPlaytime } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { Pati } from "./mascot";
import { useOptionalAssistant } from "./provider";

/** Bu kadar gündür açılmayan oyunda "kaldığın yer" kartı kendiliğinden görünür. */
const RECAP_AFTER_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

function readCollapsed(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * "Kaldığın yer": kaydın sahibi bir oyuna uzun aradan sonra döndüğünde sayfanın içinde (sohbette değil) son
 * oturumunu, o sıralar açtığı başarımları ve notunu gösterir; Pati bunlardan iki cümlelik bir
 * hatırlatma yazar. Küçültülünce son oynama tarihine kadar kapalı kalır.
 */
export function RecapCard({
  entry,
}: {
  entry: {
    id: string;
    status: string;
    lastPlayedAt: string | Date | null;
    game: { name: string; gameId?: string; id?: string; accentColor: string | null };
  };
}) {
  const assistant = useOptionalAssistant();
  const lastPlayed = entry.lastPlayedAt ? new Date(entry.lastPlayedAt) : null;
  const eligible =
    !!assistant?.enabled &&
    (entry.status === "playing" || entry.status === "paused") &&
    !!lastPlayed &&
    Date.now() - lastPlayed.getTime() > RECAP_AFTER_DAYS * DAY;
  const storageKey = `mg.ai.recap.${entry.id}`;
  const lastPlayedIso = lastPlayed?.toISOString() ?? "";
  // Katlanma tercihi tarayıcıda; okunana kadar kart çizilmez (önce kapalı çizilip sonra açılınca sayfa
  // aşağı itiliyordu).
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  useEffect(() => {
    setCollapsed(readCollapsed(storageKey) === lastPlayedIso);
  }, [storageKey, lastPlayedIso]);
  const recap = useQuery({ ...recapQuery(entry.id), enabled: eligible });
  if (!eligible || !assistant || collapsed === null) return null;

  const collapse = (value: boolean) => {
    setCollapsed(value);
    try {
      if (value) window.localStorage.setItem(storageKey, lastPlayedIso);
      else window.localStorage.removeItem(storageKey);
    } catch {
      // Hatırlanamazsa kart bir dahaki girişte yine açık gelir.
    }
  };
  const data = recap.data;
  const accent = entry.game.accentColor;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => collapse(false)}
        className="animate-pop flex h-14 w-full max-w-md items-center gap-2.5 rounded-full border bg-[#16130f] pr-4 pl-2.5 text-left"
        style={{ borderColor: `${accent ?? "#d08a5a"}59` }}
      >
        <Pati size={32} still />
        <span className="grid min-w-0 flex-1">
          <span className="text-sm font-bold">{m.ai_recap_expand()}</span>
          {data?.headline && (
            <span className="text-foreground/66 truncate text-xs">{data.headline}</span>
          )}
        </span>
        <ChevronDownIcon className="size-4" />
      </button>
    );
  }

  const max = Math.max(1, ...(data?.weeks ?? []).map((week) => week.hours));
  return (
    <article
      aria-label={m.ai_recap_kicker()}
      className="animate-pop grid max-w-2xl gap-3.5 rounded-[26px] border bg-[#16130f] p-5 shadow-[0_30px_60px_-24px_rgba(0,0,0,0.8)]"
      style={{ borderColor: `${accent ?? "#d08a5a"}59` }}
    >
      <div className="flex items-center gap-2.5">
        <Pati size={32} mood={recap.isPending ? "thinking" : "idle"} glow={accent} />
        <span className="text-foreground/70 flex-1 text-[11px] font-bold tracking-[0.16em]">
          {m.ai_recap_kicker()}
        </span>
        <button
          type="button"
          aria-label={m.ai_recap_collapse()}
          onClick={() => collapse(true)}
          className="flex size-9 items-center justify-center rounded-full bg-white/6 hover:bg-white/10"
        >
          <ChevronUpIcon className="size-4" />
        </button>
      </div>
      {recap.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : data ? (
        <>
          <h2 className="font-display m-0 text-xl leading-snug font-medium">{data.headline}</h2>
          {data.summary && (
            <p className="text-foreground/90 m-0 text-[15px] leading-relaxed">{data.summary}</p>
          )}
          <div className="grid gap-2">
            {data.lastSession && (
              <div className="flex items-start gap-3 rounded-[14px] bg-white/4 px-3 py-2.5">
                <ClockIcon className="text-foreground/75 mt-0.5 size-4 shrink-0" />
                <span className="grid gap-0.5">
                  <span className="text-foreground/62 text-xs">{m.ai_recap_last_session()}</span>
                  <span className="text-sm font-bold">
                    {formatDate(data.lastSession.startedAt, "long")} ·{" "}
                    {formatPlaytime(data.lastSession.minutes)}
                  </span>
                </span>
              </div>
            )}
            {data.note && (
              <div className="flex items-start gap-3 rounded-[14px] bg-white/4 px-3 py-2.5">
                <PencilLineIcon className="text-foreground/75 mt-0.5 size-4 shrink-0" />
                <span className="grid gap-0.5">
                  <span className="text-foreground/62 text-xs">{m.ai_recap_note()}</span>
                  <span className="text-sm font-bold">“{data.note}”</span>
                </span>
              </div>
            )}
            {data.achievements.length > 0 && (
              <div className="flex items-start gap-3 rounded-[14px] bg-white/4 px-3 py-2.5">
                <TrophyIcon className="text-foreground/75 mt-0.5 size-4 shrink-0" />
                <span className="grid gap-0.5">
                  <span className="text-foreground/62 text-xs">{m.ai_recap_achievements()}</span>
                  <span className="text-sm font-bold">
                    {data.achievements.map((item) => item.name).join(" · ")}
                  </span>
                </span>
              </div>
            )}
          </div>
          {data.weeks.length > 1 && (
            <div className="flex items-end gap-3.5">
              <div className="flex h-11 w-32 items-end gap-1.5" aria-hidden>
                {data.weeks.slice(-6).map((week, index, all) => (
                  <span
                    key={week.weekStart}
                    className="flex-1 rounded"
                    style={{
                      height: `${Math.max(6, (week.hours / max) * 44)}px`,
                      backgroundColor:
                        index === all.length - 1 ? (accent ?? "#d08a5a") : "rgb(255 255 255 / 22%)",
                    }}
                  />
                ))}
              </div>
              <span className="text-foreground/75 text-[13px]">{m.ai_recap_rhythm()}</span>
            </div>
          )}
          <span className="text-foreground/60 text-xs">{m.ai_recap_footer()}</span>
        </>
      ) : null}
      <div className="flex gap-2">
        <Button className="h-12 flex-1" onClick={() => collapse(true)}>
          {m.ai_recap_ok()}
        </Button>
        <Button
          variant="ghost"
          className="h-12 border border-white/18 px-5"
          onClick={() => {
            const gameId = entry.game.gameId ?? entry.game.id;
            assistant.ask({
              text: m.ai_recap_ask_prompt({ game: entry.game.name }),
              mentions: gameId ? [{ type: "game", gameId, label: entry.game.name }] : undefined,
              command: "recap",
              fresh: true,
            });
          }}
        >
          {m.ai_recap_ask()}
        </Button>
      </div>
    </article>
  );
}

/** Bitirilmiş ama incelemesi olmayan kayıtta röportaj daveti. */
export function ReviewInvite({ entryId }: { entryId: string }) {
  const assistant = useOptionalAssistant();
  if (!assistant?.enabled) return null;
  return (
    <div className="flex max-w-2xl items-center gap-3.5 rounded-[22px] border border-white/10 bg-[#15161c] p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/7">
        <NotebookPenIcon className="size-5" />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-center gap-2 text-[15px] font-bold">
          <Pati size={18} still />
          {m.ai_review_cta_title()}
        </span>
        <span className="text-foreground/68 text-[13px]">{m.ai_review_cta_sub()}</span>
      </span>
      <Button onClick={() => assistant.openInterview(entryId)}>{m.ai_review_cta_button()}</Button>
    </div>
  );
}
