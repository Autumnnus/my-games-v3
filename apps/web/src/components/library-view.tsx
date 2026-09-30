import { Link } from "@tanstack/react-router";
import { StarIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { GameCover } from "@/components/game-cover";
import { StatusBadge } from "@/components/status-badge";
import { DateText } from "@/components/time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPlaytime, formatRating, platformLabel, statusLabel } from "@/lib/format";
import type { LibraryItem } from "@/lib/queries";
import { m } from "@/paraglide/messages";

const liveStatuses = new Set(["playing", "paused", "backlog", "wishlist", "dropped"]);
const statusDot: Record<string, string> = {
  playing: "bg-live",
  paused: "bg-amber-300",
  backlog: "bg-sky-300",
  wishlist: "bg-violet-300",
  dropped: "bg-destructive",
};

/**
 * Kapak, kayıt sayfasına geçişte yerinde uçsun diye adı yalnızca tıklanan karta verilir. Izgaradaki her
 * kapak ad taşısaydı sayfaya her girişte yüzlerce ayrı geçiş katmanı oluşur, kapaklar yanıp sönerdi.
 * Link kendi yönlendirmesinden önce bu işleyiciyi çalıştırır; ad eski görüntü alınmadan yerinde olur.
 */
function flyCover(event: MouseEvent<HTMLElement>, entryId: string) {
  // Yeni sekmede açma (⌘/Ctrl/orta tık) sayfayı değiştirmez; ad verilirse ızgarada asılı kalırdı.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
    return;
  const cover = event.currentTarget.querySelector<HTMLElement>("[data-cover]");
  if (!cover) return;
  cover.style.viewTransitionName = `cover-${entryId}`;
  // Geçiş bitince ad kaldırılır; sonraki bir geçişte bu kapak başlığın üstünden uçmasın.
  setTimeout(() => {
    cover.style.viewTransitionName = "";
  }, 1000);
}

export function LibraryGrid({ items }: { items: LibraryItem[] }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-5 md:grid-cols-5 lg:grid-cols-7">
      {items.map((item, index) => (
        <Link
          key={item.id}
          to="/e/$id"
          params={{ id: item.id }}
          className="group animate-rise grid content-start gap-2.5"
          onClick={(event) => flyCover(event, item.id)}
          style={{
            animationDelay: `${Math.min(index, 21) * 22}ms`,
            ["--glow" as string]: item.game.accentColor ?? "rgba(0,0,0,0.6)",
          }}
        >
          <div className="relative transition-transform duration-400 ease-(--ease-salon) group-hover:-translate-y-1.5 group-hover:scale-[1.02]">
            <GameCover
              url={item.game.coverUrl}
              name={item.game.name}
              color={item.game.accentColor}
              className="transition-shadow duration-400 group-hover:shadow-[0_26px_50px_-16px_var(--glow)] group-hover:ring-white/15"
            />
            {liveStatuses.has(item.status) && (
              <span className="absolute top-2 left-2 flex h-6 items-center gap-1.5 rounded-full bg-black/70 px-2 text-[11px] font-bold backdrop-blur">
                <span className={`size-1.5 rounded-full ${statusDot[item.status] ?? ""}`} />
                <span className="hidden sm:inline">{statusLabel(item.status)}</span>
              </span>
            )}
            {item.isFavorite && (
              <StarIcon className="absolute top-2.5 right-2.5 size-4 fill-yellow-400 text-yellow-400 drop-shadow" />
            )}
            {item.rating !== null && (
              <span className="font-display absolute right-2 bottom-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/70 px-2 text-[11px] font-semibold backdrop-blur">
                {formatRating(item.rating)}
              </span>
            )}
          </div>
          <div className="grid min-w-0 gap-0.5">
            <div className="truncate text-sm font-bold">{item.game.name}</div>
            <div className="text-muted-foreground truncate text-xs">
              {statusLabel(item.status)}
              {item.playtimeMin > 0 && ` · ${formatPlaytime(item.playtimeMin)}`}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function LibraryTable({ items }: { items: LibraryItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.sort_name()}</TableHead>
          <TableHead>{m.field_status()}</TableHead>
          <TableHead className="text-right">{m.sort_rating()}</TableHead>
          <TableHead className="text-right">{m.sort_playtime()}</TableHead>
          <TableHead>{m.field_platform()}</TableHead>
          <TableHead>{m.sort_last_played()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <Link
                to="/e/$id"
                params={{ id: item.id }}
                className="flex items-center gap-3 hover:underline"
              >
                <GameCover
                  url={item.game.coverUrl}
                  name={item.game.name}
                  className="w-8 shrink-0"
                />
                <span className="font-medium">{item.game.name}</span>
              </Link>
            </TableCell>
            <TableCell>
              <StatusBadge status={item.status} />
            </TableCell>
            <TableCell className="text-right">{formatRating(item.rating) ?? m.unknown()}</TableCell>
            <TableCell className="text-right">
              {item.playtimeMin > 0 ? formatPlaytime(item.playtimeMin) : m.unknown()}
            </TableCell>
            <TableCell>{item.platform ? platformLabel(item.platform) : m.unknown()}</TableCell>
            <TableCell>
              <DateText value={item.lastPlayedAt} fallback={m.unknown()} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
