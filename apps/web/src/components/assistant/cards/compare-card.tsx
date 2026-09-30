import { Link } from "@tanstack/react-router";
import type { ToolOutput } from "@/lib/assistant";
import { formatRating } from "@/lib/format";
import { m } from "@/paraglide/messages";

type Output = ToolOutput<"compareWithUser">;

/** Eksen: ortak puanların en düşüğünden 10'a (tek bir düşük puan bütün grafiği ezmesin diye alt sınır 5). */
function scaleOf(output: Output) {
  const values = output.games.flatMap((game) => [game.you.rating ?? 10, game.them.rating ?? 10]);
  const low = Math.max(0, Math.min(5, Math.floor(Math.min(...values, 10))));
  const step = 10 - low > 5 ? 2 : 1;
  const ticks: number[] = [];
  for (let tick = low; tick <= 10; tick += step) ticks.push(tick);
  if (ticks.at(-1) !== 10) ticks.push(10);
  return { low, ticks };
}

/**
 * `compareWithUser`: ortak oyunlardaki iki puan aynı satırda (dambıl grafiği). Beyaz nokta mevcut kullanıcı,
 * turuncu diğeri; renkler açıklıkta da ayrışır. Satırın sonundaki fark kimin daha cömert olduğunu söyler.
 */
export function CompareCard({ output, wide }: { output: Output; wide?: boolean }) {
  const rows = output.games.slice(0, wide ? 12 : 6);
  const { low, ticks } = scaleOf(output);
  const pct = (value: number | null) => (((value ?? low) - low) / (10 - low)) * 100;
  const format = (value: number | null) => (value === null ? "—" : formatRating(value * 10));

  return (
    <figure className="m-0 grid gap-1 rounded-[18px] border border-white/8 bg-[#16171d] p-3.5 pb-2.5">
      <div className="flex items-center justify-between gap-3 pb-1.5">
        <figcaption className="text-sm font-bold">
          {m.ai_card_compare_title({ name: output.other.name })}
        </figcaption>
        <span className="text-foreground/75 flex shrink-0 gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="bg-foreground size-2.5 rounded-full" />
            {m.ai_card_you()}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#e8845c]" />
            {output.other.name}
          </span>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-foreground/65 py-2 text-sm">{m.ai_card_compare_empty()}</p>
      ) : (
        <>
          <ul className="grid">
            {rows.map((game) => {
              const you = pct(game.you.rating);
              const them = pct(game.them.rating);
              const diff = Math.round(((game.you.rating ?? 0) - (game.them.rating ?? 0)) * 10) / 10;
              return (
                <li
                  key={game.gameId}
                  className="grid h-10 grid-cols-[22px_minmax(0,7.5rem)_minmax(0,1fr)_2.25rem] items-center gap-2.5"
                >
                  {game.coverUrl ? (
                    <img
                      src={game.coverUrl}
                      alt=""
                      className="h-[33px] w-[22px] rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="h-[33px] w-[22px] rounded bg-white/8" />
                  )}
                  <Link
                    to="/g/$slug"
                    params={{ slug: game.slug }}
                    className="truncate text-[13px] font-bold hover:underline"
                  >
                    {game.name}
                  </Link>
                  <span
                    role="img"
                    className="relative h-10"
                    aria-label={`${m.ai_card_you()} ${format(game.you.rating)}, ${output.other.name} ${format(game.them.rating)}`}
                  >
                    <span className="absolute inset-x-0 top-[19px] h-0.5 bg-white/7" />
                    <span
                      className="absolute top-[18px] h-1 rounded-sm bg-white/26"
                      style={{ left: `${Math.min(you, them)}%`, width: `${Math.abs(you - them)}%` }}
                    />
                    <span
                      className="absolute top-3.5 size-3 -translate-x-1/2 rounded-full bg-[#e8845c] shadow-[0_0_0_2px_#16171d] transition-[left] duration-700"
                      style={{ left: `${them}%` }}
                    />
                    <span
                      className="bg-foreground absolute top-3.5 size-3 -translate-x-1/2 rounded-full shadow-[0_0_0_2px_#16171d] transition-[left] duration-700"
                      style={{ left: `${you}%` }}
                    />
                  </span>
                  <span
                    className={`text-right text-xs font-bold ${diff < 0 ? "text-[#f0a07a]" : "text-foreground/85"}`}
                  >
                    {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                    {formatRating(Math.abs(diff) * 10)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="grid grid-cols-[22px_minmax(0,7.5rem)_minmax(0,1fr)_2.25rem] gap-2.5">
            <span />
            <span />
            <span className="text-foreground/55 relative h-4 text-[11px]">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${pct(tick)}%` }}
                >
                  {tick}
                </span>
              ))}
            </span>
            <span />
          </div>
        </>
      )}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/7 pt-2">
        {output.compatibilityPercent !== null ? (
          <span className="text-foreground/70 text-xs">
            {m.ai_card_compatibility({ value: output.compatibilityPercent })}
          </span>
        ) : (
          <span />
        )}
        <Link
          to="/compare"
          search={{ a: output.you.username, b: output.other.username }}
          className="text-xs font-bold hover:underline"
        >
          {m.ai_card_open_compare()}
        </Link>
      </div>
    </figure>
  );
}
