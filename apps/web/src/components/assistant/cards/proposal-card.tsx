import type { EntryStatus } from "@my-games/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, CheckIcon, LoaderIcon, Undo2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { GameCover } from "@/components/game-cover";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";
import {
  type ApprovalPreview,
  approvalPreview,
  FIELD_LABELS,
  type ToolPart,
  toolNameOf,
} from "@/lib/assistant";
import { errorMessage, formatDate, formatPlaytime, formatRating, statusLabel } from "@/lib/format";
import { historyQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

type Change = { field: string; from: unknown; to: unknown };

export function formatValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  switch (field) {
    case "status":
      return statusLabel(value as EntryStatus);
    case "rating":
      return typeof value === "number" ? (formatRating(value * 10) ?? "—") : String(value);
    case "favorite":
    case "isFavorite":
      return value ? m.ai_value_yes() : m.ai_value_no();
    case "startedAt":
    case "finishedAt":
    case "lastPlayedAt":
      return formatDate(String(value)) ?? "—";
    case "playtimeHours":
      return typeof value === "number" ? formatPlaytime(value * 60) : String(value);
    case "review": {
      const text = String(value);
      return `“${text.length > 60 ? `${text.slice(0, 60)}…` : text}”`;
    }
    default:
      return String(value);
  }
}

function DiffRows({ changes }: { changes: Change[] }) {
  return (
    <ul className="grid gap-1.5">
      {changes.map((change) => (
        <li
          key={change.field}
          className="grid min-h-9 grid-cols-[5.5rem_minmax(0,1fr)_14px_minmax(0,1fr)] items-center gap-2 rounded-[10px] bg-white/4 px-3 py-1.5 text-[13px]"
        >
          <span className="text-foreground/62">
            {(FIELD_LABELS[change.field] ?? (() => change.field))()}
          </span>
          <span className="text-foreground/60 truncate line-through">
            {formatValue(change.field, change.from)}
          </span>
          <ArrowRightIcon className="text-foreground/60 size-3.5" />
          <span className="truncate font-bold text-[#f2c77a]">
            {formatValue(change.field, change.to)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function GameHeader({
  preview,
  label,
}: {
  preview: Extract<ApprovalPreview, { kind: "entry" }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <GameCover
        url={preview.game.coverUrl}
        name={preview.game.name}
        color={preview.game.accentColor}
        className="w-8 shrink-0 rounded-md"
      />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-[15px] font-bold">{preview.game.name}</span>
        <span className="text-foreground/60 text-[11px] font-bold tracking-[0.14em]">{label}</span>
      </span>
    </div>
  );
}

function summary(changes: Change[]) {
  return changes
    .slice(0, 3)
    .map(
      (change) =>
        `${(FIELD_LABELS[change.field] ?? (() => change.field))()}: ${formatValue(change.field, change.to)}`,
    )
    .join(" · ");
}

/**
 * Yazma araçlarının kartı. Onay beklerken "önce → sonra" farkını gösterir (sunucunun öneri anındaki
 * önizlemesi); onaylanınca uygulanan değişiklikleri ve "Geri al"ı, reddedilince durumunu gösterir.
 */
export function ProposalCard({
  part,
  onRespond,
}: {
  part: ToolPart;
  onRespond: (approvalId: string, approved: boolean) => void;
}) {
  const name = toolNameOf(part);
  const queryClient = useQueryClient();
  const [revertedHere, setReverted] = useState(false);
  const applied =
    part.state === "output-available" &&
    part.output &&
    typeof part.output === "object" &&
    "historyId" in part.output
      ? (part.output as { entryId: string; historyId: string | null })
      : null;
  // Geri alma başka bir görünümde (panel ↔ tam ekran) ya da sayfa yenilenmeden önce yapılmış olabilir.
  const history = useQuery({
    ...historyQuery(applied?.entryId ?? ""),
    enabled: !!applied?.historyId,
  });
  const reverted =
    revertedHere ||
    !!history.data?.history.find((item) => item.id === applied?.historyId)?.revertedAt;
  const approval = (
    part as {
      approval?: { id: string; approved?: boolean; isAutomatic?: boolean; reason?: string };
    }
  ).approval;
  const preview = approvalPreview(part);
  const kindLabel =
    name === "addToLibrary" ? m.ai_proposal_kind_add() : m.ai_proposal_kind_update();

  const undo = useMutation({
    mutationFn: (historyId: string) =>
      unwrap(api.history[":id"].revert.$post({ param: { id: historyId } })),
    onSuccess: async () => {
      setReverted(true);
      for (const queryKey of [
        ["library"],
        ["entry"],
        ["profile"],
        ["history"],
        ["feed"],
        ["game"],
        ["my-entry"],
      ]) {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const shell = (border: string, children: React.ReactNode) => (
    <article className={`animate-pop overflow-hidden rounded-[18px] border bg-[#16171d] ${border}`}>
      {children}
    </article>
  );

  if (part.state === "input-streaming" || part.state === "input-available") {
    return shell(
      "border-white/8",
      <div className="text-foreground/70 flex items-center gap-2 p-3.5 text-sm">
        <LoaderIcon className="size-4 animate-spin" />
        {m.ai_proposal_preparing()}
      </div>,
    );
  }

  if (part.state === "approval-requested" && approval && !approval.isAutomatic) {
    return shell(
      "border-[#f2c77a]/35",
      <div className="grid gap-3 p-3.5">
        {preview?.kind === "entry" ? (
          <>
            <GameHeader preview={preview} label={kindLabel} />
            <DiffRows changes={preview.changes} />
          </>
        ) : preview?.kind === "inbox" ? (
          <>
            <span className="text-foreground/60 text-[11px] font-bold tracking-[0.14em]">
              {preview.action === "approve"
                ? m.ai_proposal_kind_inbox_approve()
                : m.ai_proposal_kind_inbox_reject()}
            </span>
            <ul className="grid gap-1.5">
              {preview.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2.5 rounded-[10px] bg-white/4 px-3 py-1.5 text-[13px]"
                >
                  <span className="truncate font-bold">{item.game?.name ?? item.kind}</span>
                  <span className="text-foreground/55 shrink-0 text-xs">{item.source}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="flex gap-2">
          <Button className="h-10 flex-1" onClick={() => onRespond(approval.id, true)}>
            <CheckIcon />
            {m.ai_proposal_approve()}
          </Button>
          <Button
            variant="ghost"
            className="h-10 border border-white/16"
            onClick={() => onRespond(approval.id, false)}
          >
            {m.ai_proposal_reject()}
          </Button>
        </div>
      </div>,
    );
  }

  if (part.state === "approval-responded") {
    return shell(
      "border-white/8",
      <div className="text-foreground/75 flex items-center gap-2 p-3.5 text-sm">
        {approval?.approved ? (
          <LoaderIcon className="size-4 animate-spin" />
        ) : (
          <XIcon className="size-4" />
        )}
        {approval?.approved ? m.ai_proposal_applying() : m.ai_proposal_rejected()}
      </div>,
    );
  }

  if (part.state === "output-denied") {
    return shell(
      "border-white/8",
      <div className="flex items-center gap-3 p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/8">
          <XIcon className="text-foreground/70 size-4" />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="text-sm font-bold">
            {preview?.kind === "entry"
              ? preview.game.name
              : approval?.isAutomatic
                ? m.ai_proposal_denied()
                : m.ai_proposal_rejected()}
          </span>
          <span className="text-foreground/65 text-xs">
            {approval?.isAutomatic ? m.ai_proposal_denied() : m.ai_proposal_rejected()}
          </span>
        </span>
      </div>,
    );
  }

  if (part.state === "output-error") {
    return shell(
      "border-destructive/40",
      <p className="text-destructive p-3.5 text-sm">{part.errorText || m.ai_error()}</p>,
    );
  }

  if (part.state === "output-available") {
    const output = part.output as
      | {
          entryId: string;
          game: { name: string; coverUrl: string | null; accentColor: string | null };
          changes: Change[];
          historyId: string | null;
        }
      | { action: "approve" | "reject"; results: Array<{ ok: boolean }> }
      | { error: string };
    if ("results" in output) {
      return shell(
        "border-live/30",
        <div className="flex items-center gap-3 p-3">
          <span className="bg-live/15 text-live flex size-8 shrink-0 items-center justify-center rounded-full">
            <CheckIcon className="size-4" strokeWidth={2.8} />
          </span>
          <span className="text-sm font-bold">
            {m.ai_proposal_inbox_done({
              count: output.results.filter((result) => result.ok).length,
            })}
          </span>
        </div>,
      );
    }
    if ("error" in output) return null;
    return shell(
      reverted ? "border-white/8" : "border-live/30",
      <div className="flex items-center gap-3 py-2.5 pr-2 pl-3">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${reverted ? "bg-white/8" : "bg-live/15 text-live"}`}
        >
          {reverted ? (
            <Undo2Icon className="size-4" />
          ) : (
            <CheckIcon className="size-4" strokeWidth={2.8} />
          )}
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <Link
            to="/e/$id"
            params={{ id: output.entryId }}
            className="truncate text-sm font-bold hover:underline"
          >
            {reverted
              ? `${output.game.name} · ${m.ai_proposal_reverted()}`
              : name === "addToLibrary"
                ? m.ai_proposal_added({ game: output.game.name })
                : m.ai_proposal_applied({ game: output.game.name })}
          </Link>
          <span className="text-foreground/65 truncate text-xs">
            {approval?.isAutomatic ? m.ai_proposal_auto() : summary(output.changes)}
          </span>
        </span>
        {output.historyId && !reverted && (
          <Button
            variant="ghost"
            size="sm"
            disabled={undo.isPending}
            onClick={() => output.historyId && undo.mutate(output.historyId)}
          >
            <Undo2Icon />
            {m.ai_card_undo()}
          </Button>
        )}
      </div>,
    );
  }
  return null;
}
