import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import * as z from "zod/mini";
import { StatTile } from "@/components/charts";
import { GameCover } from "@/components/game-cover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage, formatPlaytime, formatRating } from "@/lib/format";
import { compareQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/compare")({
  validateSearch: z.object({ a: z.optional(z.string()), b: z.optional(z.string()) }),
  loaderDeps: ({ search }) => ({ a: search.a, b: search.b }),
  loader: ({ context, deps }) =>
    deps.a && deps.b ? context.queryClient.prefetchQuery(compareQuery(deps.a, deps.b)) : undefined,
  head: () => ({ meta: [{ title: `${m.compare_title()} · ${m.app_name()}` }] }),
  component: ComparePage,
});

type Row = {
  gameId: string;
  name: string;
  slug: string;
  coverUrl: string | null;
  a: { rating: number | null; playtimeMin: number | null };
  b: { rating: number | null; playtimeMin: number | null };
};

function GameRows({ rows, names }: { rows: Row[]; names: [string, string] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.sort_name()}</TableHead>
          <TableHead className="text-right">{names[0]}</TableHead>
          <TableHead className="text-right">{names[1]}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.gameId}>
            <TableCell>
              <Link
                to="/g/$slug"
                params={{ slug: row.slug }}
                className="flex items-center gap-2 hover:underline"
              >
                <GameCover url={row.coverUrl} name={row.name} className="w-6 shrink-0" />
                {row.name}
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatRating(row.a.rating) ?? m.unknown()}
              <div className="text-muted-foreground text-xs">
                {formatPlaytime(row.a.playtimeMin)}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatRating(row.b.rating) ?? m.unknown()}
              <div className="text-muted-foreground text-xs">
                {formatPlaytime(row.b.playtimeMin)}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ComparePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const ready = !!search.a && !!search.b;
  const query = useQuery({ ...compareQuery(search.a ?? "", search.b ?? ""), enabled: ready });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void navigate({ search: { a: String(form.get("a")).trim(), b: String(form.get("b")).trim() } });
  }

  const data = query.data;
  const names: [string, string] = data
    ? [data.users[0]?.name ?? "", data.users[1]?.name ?? ""]
    : ["", ""];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{m.compare_title()}</h1>
        <p className="text-muted-foreground text-sm">{m.compare_description()}</p>
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={onSubmit}>
        <Input
          name="a"
          defaultValue={search.a}
          placeholder={m.compare_first()}
          className="max-w-48"
          required
        />
        <Input
          name="b"
          defaultValue={search.b}
          placeholder={m.compare_second()}
          className="max-w-48"
          required
        />
        <Button type="submit">{m.compare_submit()}</Button>
      </form>

      {query.error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(query.error)}</AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              label={m.compare_compatibility()}
              value={data.compatibility === null ? m.unknown() : `%${data.compatibility}`}
            />
            <StatTile label={m.compare_shared()} value={data.counts.shared} />
            <StatTile label={m.compare_only({ name: names[0] })} value={data.counts.onlyA} />
            <StatTile label={m.compare_only({ name: names[1] })} value={data.counts.onlyB} />
            <StatTile label={m.compare_both_completed()} value={data.counts.bothCompleted} />
            <StatTile
              label={m.compare_average_difference()}
              value={formatRating(data.averageDifference) ?? m.unknown()}
            />
          </div>
          {data.compatibility === null && (
            <p className="text-muted-foreground text-sm">{m.compare_compatibility_unknown()}</p>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            {data.agreements.length > 0 && (
              <section className="grid gap-2">
                <h2 className="font-semibold">{m.compare_agreements()}</h2>
                <GameRows rows={data.agreements} names={names} />
              </section>
            )}
            {data.disagreements.length > 0 && (
              <section className="grid gap-2">
                <h2 className="font-semibold">{m.compare_disagreements()}</h2>
                <GameRows rows={data.disagreements} names={names} />
              </section>
            )}
          </div>
          <section className="grid gap-2">
            <h2 className="font-semibold">{m.compare_all_shared()}</h2>
            <GameRows rows={data.shared} names={names} />
          </section>
        </>
      )}
    </div>
  );
}
