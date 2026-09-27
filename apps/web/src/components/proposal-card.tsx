import { gameCoverUrl } from "@my-games/shared";
import { ClientOnly, Link } from "@tanstack/react-router";
import { CheckIcon, XIcon } from "lucide-react";
import { GameCover } from "@/components/game-cover";
import { RelativeTime } from "@/components/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatPlaytime } from "@/lib/format";
import { describeChange } from "@/lib/history";
import type { Proposal } from "@/lib/queries";
import { m } from "@/paraglide/messages";

type Payload =
  | { op: "update"; changes: Array<{ field: string; from: unknown; to: unknown }> }
  | { op: "create"; game: { name: string }; fields: { playtimeSteamMin?: number | null } }
  | {
      op: "match";
      gameName: string;
      candidates: Array<{
        igdbId: number;
        name: string;
        coverImageId: string | null;
        releaseYear: number | null;
        score: number;
      }>;
    }
  | { op: "conflict"; manualMin: number; steamMin: number };

export const kindLabels: Record<string, () => string> = {
  playtime: m.proposal_kind_playtime,
  last_played: m.proposal_kind_last_played,
  achievements: m.proposal_kind_achievements,
  status: m.proposal_kind_status,
  new_game: m.proposal_kind_new_game,
  playtime_conflict: m.proposal_kind_playtime_conflict,
  match: m.proposal_kind_match,
  entry_update: m.proposal_kind_entry_update,
  entry_create: m.proposal_kind_entry_create,
};

export const sourceLabels: Record<string, () => string> = {
  steam: m.proposal_source_steam,
  igdb: m.proposal_source_igdb,
  migration: m.proposal_source_migration,
  ai: m.proposal_source_ai,
  system: m.proposal_source_system,
};

const resolvedLabels: Record<string, () => string> = {
  approved: m.proposal_status_approved,
  rejected: m.proposal_status_rejected,
  auto_applied: m.proposal_status_auto_applied,
};

/** Seçilip toplu onaylanabilen öneriler (tek tıkla karar verilebilenler). */
export function isBulkable(proposal: Proposal) {
  const op = (proposal.payload as Payload).op;
  return op === "update" || op === "create";
}

export function ProposalCard(props: {
  proposal: Proposal;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onResolve?: (
    action: "approve" | "reject",
    options?: { choice?: string; ignore?: boolean },
  ) => void;
  pending?: boolean;
}) {
  const { proposal } = props;
  const payload = proposal.payload as Payload;
  const game = proposal.game;
  const resolved = proposal.status !== "pending";

  return (
    <article className="flex gap-3 rounded-lg border p-3">
      {props.onSelect && isBulkable(proposal) && !resolved && (
        // Radix'in gizli form input'u SSR'da stil uyuşmazlığı veriyor; seçim zaten JS ister.
        <ClientOnly fallback={<span className="mt-1 size-4 shrink-0" />}>
          <Checkbox
            className="mt-1"
            checked={props.selected}
            onCheckedChange={(checked) => props.onSelect?.(checked === true)}
            aria-label={game?.name ?? ""}
          />
        </ClientOnly>
      )}
      {game && (
        <GameCover
          url={gameCoverUrl(game, "cover_small")}
          name={game.name}
          className="w-12 shrink-0"
        />
      )}
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {game ? (
            proposal.entryId ? (
              <Link
                to="/e/$id"
                params={{ id: proposal.entryId }}
                className="font-medium hover:underline"
              >
                {game.name}
              </Link>
            ) : (
              <Link
                to="/g/$slug"
                params={{ slug: game.slug }}
                className="font-medium hover:underline"
              >
                {game.name}
              </Link>
            )
          ) : null}
          <Badge variant="outline">{(kindLabels[proposal.kind] ?? (() => proposal.kind))()}</Badge>
          <Badge variant="secondary">
            {(sourceLabels[proposal.source] ?? m.proposal_source_system)()}
          </Badge>
          <RelativeTime value={proposal.createdAt} className="text-muted-foreground text-xs" />
        </div>

        {payload.op === "update" && (
          <ul className="text-muted-foreground grid gap-0.5 text-sm">
            {payload.changes.map((change) => (
              <li key={change.field}>{describeChange(change)}</li>
            ))}
          </ul>
        )}
        {payload.op === "create" && (
          <p className="text-muted-foreground text-sm">
            {m.proposal_new_game_hint({
              time: formatPlaytime(payload.fields.playtimeSteamMin ?? 0),
            })}
          </p>
        )}
        {payload.op === "conflict" && (
          <p className="text-muted-foreground text-sm">
            {m.proposal_conflict_hint({
              manual: formatPlaytime(payload.manualMin),
              steam: formatPlaytime(payload.steamMin),
            })}
          </p>
        )}
        {payload.op === "match" && !resolved && (
          <div className="grid gap-2">
            <p className="text-muted-foreground text-sm">
              {m.proposal_match_hint({ name: payload.gameName })}
            </p>
            <div className="grid gap-1">
              {payload.candidates.map((candidate) => (
                <button
                  type="button"
                  key={candidate.igdbId}
                  disabled={props.pending}
                  onClick={() => props.onResolve?.("approve", { choice: String(candidate.igdbId) })}
                  className="hover:bg-accent flex items-center gap-3 rounded-md border p-2 text-left text-sm"
                >
                  <GameCover
                    url={gameCoverUrl({ coverImageId: candidate.coverImageId }, "cover_small")}
                    name={candidate.name}
                    className="w-8 shrink-0"
                  />
                  <span className="flex-1">
                    {candidate.name} {candidate.releaseYear ? `(${candidate.releaseYear})` : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    %{Math.round(candidate.score * 100)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {resolved ? (
          <Badge variant="outline" className="w-fit">
            {(resolvedLabels[proposal.status] ?? (() => proposal.status))()}
          </Badge>
        ) : (
          <div className="flex flex-wrap gap-2">
            {payload.op === "conflict" ? (
              <>
                <Button
                  size="sm"
                  disabled={props.pending}
                  onClick={() => props.onResolve?.("approve", { choice: "use_steam" })}
                >
                  {m.proposal_conflict_use_steam()}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={props.pending}
                  onClick={() => props.onResolve?.("approve", { choice: "keep_both" })}
                >
                  {m.proposal_conflict_keep_both()}
                </Button>
              </>
            ) : payload.op === "match" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={props.pending}
                onClick={() => props.onResolve?.("reject")}
              >
                <XIcon />
                {m.proposal_match_none()}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  disabled={props.pending}
                  onClick={() => props.onResolve?.("approve")}
                >
                  <CheckIcon />
                  {m.inbox_approve()}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={props.pending}
                  onClick={() => props.onResolve?.("reject")}
                >
                  <XIcon />
                  {m.inbox_reject()}
                </Button>
                {payload.op === "create" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={props.pending}
                    onClick={() => props.onResolve?.("reject", { ignore: true })}
                  >
                    {m.inbox_never()}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
