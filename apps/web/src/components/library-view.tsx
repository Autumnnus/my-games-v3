import { Link } from "@tanstack/react-router";
import { StarIcon } from "lucide-react";
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
import { formatPlaytime, formatRating, platformLabel } from "@/lib/format";
import type { LibraryItem } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export function LibraryGrid({ items }: { items: LibraryItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => (
        <Link key={item.id} to="/e/$id" params={{ id: item.id }} className="group grid gap-2">
          <div className="relative">
            <GameCover
              url={item.game.coverUrl}
              name={item.game.name}
              className="transition-transform group-hover:-translate-y-0.5"
            />
            {item.isFavorite && (
              <StarIcon className="absolute top-2 right-2 size-4 fill-yellow-400 text-yellow-400 drop-shadow" />
            )}
            {item.rating !== null && (
              <span className="bg-background/85 absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-xs font-semibold">
                {formatRating(item.rating)}
              </span>
            )}
          </div>
          <div className="grid gap-1">
            <div className="line-clamp-2 text-sm leading-tight font-medium">{item.game.name}</div>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <StatusBadge status={item.status} />
              {item.playtimeMin > 0 && <span>{formatPlaytime(item.playtimeMin)}</span>}
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
