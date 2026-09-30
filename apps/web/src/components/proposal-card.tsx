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
  | {
      op: "create";
      game: { name: string; provider?: string };
      fields: {
        playtimeSteamMin?: number | null;
        playtimePsnMin?: number | null;
        playtimeXboxMin?: number | null;
      };
    }
  | {
      op: "screenshots";
      items: Array<{ externalId: string; thumbUrl: string | null; url: string }>;
    }
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
  | {
      op: "conflict";
      manualMin: number;
      provider?: string;
      platformMin?: number;
      steamMin?: number;
    };

export const kindLabels: Record<string, () => string> = {
  playtime: m.proposal_kind_playtime,
  achievements: m.proposal_kind_achievements,
  status: m.proposal_kind_status,
  new_game: m.proposal_kind_new_game,
  playtime_conflict: m.proposal_kind_playtime_conflict,
  match: m.proposal_kind_match,
  entry_update: m.proposal_kind_entry_update,
  entry_create: m.proposal_kind_entry_create,
  screenshots: m.proposal_kind_screenshots,
};

const platformNames: Record<string, () => string> = {
  steam: m.provider_steam,
  psn: m.provider_psn,
  xbox: m.provider_xbox,
};

export function platformName(source: string | undefined) {
  return (platformNames[source ?? "steam"] ?? m.provider_steam)();
}

/** Öneri türünün adı; "yeni oyun" kaynağa göre söylenir (Steam / PlayStation / Xbox). */
export function proposalKindLabel(source: string, kind: string) {
  if (kind === "new_game" && source !== "steam") {
    return m.proposal_kind_new_game_platform({ platform: platformName(source) });
  }
  return (kindLabels[kind] ?? (() => kind))();
}

export const sourceLabels: Record<string, () => string> = {
  steam: m.proposal_source_steam,
  psn: m.proposal_source_psn,
  xbox: m.proposal_source_xbox,
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

function NewGameHint({
  payload,
  source,
}: {
  payload: Extract<Payload, { op: "create" }>;
  source: string;
}) {
  const minutes =
    payload.fields.playtimeSteamMin ??
    payload.fields.playtimePsnMin ??
    payload.fields.playtimeXboxMin;
  const platform = platformName(payload.game.provider ?? source);
  return (
    <p className="text-muted-foreground text-sm">
      {minutes
        ? m.proposal_new_game_platform_hint({ time: formatPlaytime(minutes), platform })
        : m.proposal_new_game_no_time({ platform })}
    </p>
  );
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
    <article className="bg-card flex gap-3 rounded-[22px] border p-4">
      {props.onSelect && isBulkable(proposal) && !resolved && (
        // Radix'in gizli form input'u SSR'da stil uyuşmazlığı veriyor; seçim zaten JS ister.
        <ClientOnly fallback={<span className="mt-0.5 size-5 shrink-0" />}>
          <Checkbox
            className="mt-0.5"
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
          <Badge variant="outline">{proposalKindLabel(proposal.source, proposal.kind)}</Badge>
          <Badge variant="secondary">
            {(sourceLabels[proposal.source] ?? m.proposal_source_system)()}
          </Badge>
          <RelativeTime value={proposal.createdAt} className="text-muted-foreground text-xs" />
        </div>

        <ProposalDetails proposal={proposal} pending={props.pending} onResolve={props.onResolve} />

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
                  onClick={() => props.onResolve?.("approve", { choice: "use_platform" })}
                >
                  {m.proposal_conflict_use_platform({ platform: platformName(payload.provider) })}
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

/** Önerinin içeriği: değişiklikler, yeni oyun, süre çakışması, ekran görüntüleri ya da eşleşme adayları. */
export function ProposalDetails(props: {
  proposal: Proposal;
  pending?: boolean;
  onResolve?: (
    action: "approve" | "reject",
    options?: { choice?: string; ignore?: boolean },
  ) => void;
}) {
  const { proposal } = props;
  const payload = proposal.payload as Payload;
  const resolved = proposal.status !== "pending";
  return (
    <>
      {payload.op === "update" && (
        <ul className="text-muted-foreground grid gap-0.5 text-sm">
          {payload.changes.map((change) => (
            <li key={change.field}>{describeChange(change)}</li>
          ))}
        </ul>
      )}
      {payload.op === "create" && <NewGameHint payload={payload} source={proposal.source} />}
      {payload.op === "conflict" && (
        <p className="text-muted-foreground text-sm">
          {m.proposal_conflict_platform_hint({
            manual: formatPlaytime(payload.manualMin),
            platform: platformName(payload.provider),
            time: formatPlaytime(payload.platformMin ?? payload.steamMin ?? 0),
          })}
        </p>
      )}
      {payload.op === "screenshots" && (
        <div className="grid gap-2">
          <p className="text-muted-foreground text-sm">
            {m.proposal_screenshots_hint({ count: payload.items.length })}
          </p>
          <div className="flex flex-wrap gap-1">
            {payload.items.slice(0, 8).map((item) => (
              <img
                key={item.externalId}
                src={item.thumbUrl ?? item.url}
                alt=""
                loading="lazy"
                className="h-14 rounded object-cover"
              />
            ))}
          </div>
        </div>
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
                  className="w-8 shrink-0 rounded-md"
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
    </>
  );
}
