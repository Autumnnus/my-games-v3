import { cn } from "cn";
import { ChevronLeftIcon, ChevronRightIcon, LinkIcon, PauseIcon, PlayIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_ACCENT } from "@/components/stage";
import { Button } from "@/components/ui/button";
import { formatPlaytime, formatRating } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

/** Kare başına süre (ms). */
const SLIDE_MS = 5500;

type StoryGame = {
  entryId: string;
  name: string;
  coverUrl: string | null;
  heroUrl?: string | null;
  accentColor?: string | null;
  rating: number | null;
  finishedAt?: string | null;
  playtimeMin?: number | null;
};

export type WrappedData = {
  year: number;
  finishedCount: number;
  averageRating: number | null;
  playedMinutes: number;
  /** `playedMinutes`'ın takip başlamadan önceki tahmin olan kısmı. */
  estimatedMinutes?: number;
  playedDays: number;
  finished: StoryGame[];
  genres: Array<{ key: string; count: number }>;
};

type Slide = {
  key: string;
  color: string;
  image?: string | null;
  kicker: string;
  big: ReactNode;
  sub?: ReactNode;
  extra?: ReactNode;
};

function monthName(month: number) {
  return new Intl.DateTimeFormat(getLocale(), { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, month - 1, 1)),
  );
}

/** Verideki gerçek sayılardan kareler kurar; olmayan bilgi için kare atlanır. */
function buildSlides(data: WrappedData, name: string): Slide[] {
  const slides: Slide[] = [];
  const best = data.finished[0];
  slides.push({
    key: "intro",
    color: best?.accentColor ?? DEFAULT_ACCENT,
    kicker: m.wrapped_s_kicker(),
    big: String(data.year),
    sub: name,
  });

  if (data.finishedCount > 0) {
    const perMonth = new Map<number, number>();
    for (const game of data.finished) {
      if (!game.finishedAt) continue;
      const month = new Date(game.finishedAt).getUTCMonth() + 1;
      perMonth.set(month, (perMonth.get(month) ?? 0) + 1);
    }
    const busiest = [...perMonth.entries()].sort((a, b) => b[1] - a[1])[0];
    slides.push({
      key: "finished",
      color: "#1d3b8f",
      kicker: m.wrapped_finished().toLocaleUpperCase(getLocale()),
      big: m.wrapped_s_finished({ count: data.finishedCount }),
      sub:
        busiest && busiest[1] > 1
          ? m.wrapped_s_busiest({ month: monthName(busiest[0]), count: busiest[1] })
          : undefined,
    });
  }

  const finishedMinutes = data.finished.reduce((sum, game) => sum + (game.playtimeMin ?? 0), 0);
  const minutes = data.playedMinutes || finishedMinutes;
  if (minutes > 0) {
    slides.push({
      key: "time",
      color: "#2a1f5c",
      kicker: m.wrapped_s_time_kicker(),
      // Tahmin içeren süre işaretli: "~" ve alt satırda "Tahmini".
      big: `${data.estimatedMinutes ? "~" : ""}${formatPlaytime(minutes)}`,
      sub: data.playedMinutes
        ? `${m.wrapped_days()}: ${data.playedDays}${data.estimatedMinutes ? ` · ${m.estimated()}` : ""}`
        : m.wrapped_s_time_sub(),
    });
  }

  if (best) {
    slides.push({
      key: "best",
      color: best.accentColor ?? DEFAULT_ACCENT,
      image: best.heroUrl ?? best.coverUrl,
      kicker: m.wrapped_s_best_kicker(),
      big: best.name,
      sub: [formatRating(best.rating), best.playtimeMin ? formatPlaytime(best.playtimeMin) : null]
        .filter(Boolean)
        .join(" · "),
    });
  }

  const rated = data.finished.filter((game) => game.rating !== null);
  const worst = rated.at(-1);
  if (worst && rated.length >= 3 && worst.entryId !== best?.entryId) {
    slides.push({
      key: "worst",
      color: "#6e1c26",
      image: worst.heroUrl ?? worst.coverUrl,
      kicker: m.wrapped_s_worst_kicker(),
      big: formatRating(worst.rating) ?? "",
      sub: worst.name,
    });
  }

  const genre = data.genres[0];
  if (genre) {
    slides.push({
      key: "genre",
      color: "#0f5f58",
      kicker: m.wrapped_s_genre_kicker(),
      big: genre.key,
      sub: data.genres
        .slice(1, 4)
        .map((item) => item.key)
        .join(" · "),
    });
  }

  slides.push({
    key: "summary",
    color: "#141418",
    kicker: m.wrapped_s_summary_kicker(),
    big: formatRating(data.averageRating) ?? String(data.finishedCount),
    sub: data.averageRating !== null ? m.wrapped_s_average() : m.wrapped_finished(),
    extra: (
      <div className="grid grid-cols-6 gap-1.5">
        {data.finished
          .slice(0, 12)
          .map((game) =>
            game.coverUrl ? (
              <img
                key={game.entryId}
                src={game.coverUrl}
                alt={game.name}
                className="aspect-[2/3] w-full rounded-md object-cover"
              />
            ) : null,
          )}
      </div>
    ),
  });
  return slides;
}

/**
 * Yıl özeti, hikâye biçiminde: kareler kendiliğinden ilerler, üstte ilerleme çubukları. Sol üçte bire dokunmak
 * geri, gerisi ileri götürür; ok tuşları ve düğmeler de çalışır. Son karede durur.
 */
export function WrappedStory({ data, name }: { data: WrappedData; name: string }) {
  const slides = buildSlides(data, name);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const last = slides.length - 1;
  const slide = slides[Math.min(index, last)];

  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(last, next))), [last]);

  useEffect(() => {
    if (paused || index >= last) return;
    const timer = setTimeout(() => go(index + 1), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, paused, last, go]);

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") go(index + 1);
    else if (event.key === "ArrowLeft") go(index - 1);
    else if (event.key === " ") {
      event.preventDefault();
      setPaused((value) => !value);
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(m.wrapped_copied());
    } catch {
      toast.error(m.error_generic());
    }
  };

  if (!slide) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={m.wrapped_title({ year: String(data.year) })}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: hikâye ok tuşlarıyla gezilebilsin diye odaklanabilir.
      tabIndex={0}
      onKeyDown={onKey}
      className="relative mx-auto aspect-[9/16] h-[min(76dvh,760px)] max-w-full overflow-hidden rounded-[28px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] outline-none transition-colors duration-700 focus-visible:ring-2 focus-visible:ring-white/60"
      style={{ backgroundColor: slide.color }}
    >
      {slide.image && (
        <img
          key={`image-${slide.key}`}
          src={slide.image}
          alt=""
          className="animate-rise absolute inset-0 size-full object-cover opacity-70"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80" />
      <span
        className="absolute -top-24 -right-24 size-80 rounded-full opacity-40 blur-2xl transition-colors duration-700"
        style={{ backgroundColor: slide.color }}
      />

      <div className="absolute inset-x-3.5 top-3 z-10 flex gap-1">
        {slides.map((item, i) => (
          <span key={item.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <span
              key={`${item.key}-${i === index ? index : "x"}`}
              className={cn(
                "block h-full origin-left bg-white",
                i < index && "scale-x-100",
                i > index && "scale-x-0",
                i === index &&
                  (index >= last ? "scale-x-100" : "animate-[story-fill_linear_forwards]"),
              )}
              style={
                i === index && index < last
                  ? {
                      animationDuration: `${SLIDE_MS}ms`,
                      animationPlayState: paused ? "paused" : "running",
                    }
                  : undefined
              }
            />
          </span>
        ))}
      </div>

      <div className="absolute top-7 right-3 z-20 flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={paused ? m.wrapped_play() : m.wrapped_pause()}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
      </div>

      <button
        type="button"
        aria-label={m.wrapped_prev()}
        onClick={() => go(index - 1)}
        className="absolute inset-y-16 left-0 z-10 w-1/3"
      />
      <button
        type="button"
        aria-label={m.wrapped_next()}
        onClick={() => go(index + 1)}
        className="absolute inset-y-16 right-0 z-10 w-2/3"
      />

      <div
        key={`text-${slide.key}`}
        className="pointer-events-none absolute inset-x-7 bottom-24 z-10 grid gap-4 *:animate-rise [&>*:nth-child(2)]:[animation-delay:80ms] [&>*:nth-child(3)]:[animation-delay:160ms]"
      >
        <span className="text-xs font-bold tracking-[0.18em] text-white/85">{slide.kicker}</span>
        <span className="font-display text-[clamp(2.5rem,11vw,4.5rem)] leading-[1.02] font-bold tracking-tight break-words text-white">
          {slide.big}
        </span>
        {slide.sub && <span className="text-lg leading-snug text-white/90">{slide.sub}</span>}
        {slide.extra}
      </div>

      <div className="absolute inset-x-5 bottom-6 z-20 flex items-center justify-between">
        <Button
          variant="glass"
          size="icon"
          aria-label={m.wrapped_prev()}
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        {index === last ? (
          <Button onClick={share}>
            <LinkIcon />
            {m.wrapped_share()}
          </Button>
        ) : (
          <span className="text-xs text-white/70">
            {index + 1} / {slides.length}
          </span>
        )}
        <Button
          variant="glass"
          size="icon"
          aria-label={m.wrapped_next()}
          disabled={index === last}
          onClick={() => go(index + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </section>
  );
}
