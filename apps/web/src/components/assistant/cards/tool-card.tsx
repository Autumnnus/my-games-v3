import { LoaderIcon, SearchXIcon } from "lucide-react";
import {
  type ToolOutput,
  type ToolPart,
  toolNameOf,
  toolRunningLabel,
  WRITE_TOOLS,
} from "@/lib/assistant";
import { m } from "@/paraglide/messages";
import { CompareCard } from "./compare-card";
import { LibraryCard } from "./library-card";
import {
  AchievementsCard,
  BacklogCard,
  CatalogCard,
  GameCard,
  InboxCard,
  PlayersCard,
  PlayHistoryCard,
  StatsCard,
} from "./misc-cards";
import { ProposalCard } from "./proposal-card";

export function ToolStatus({ label, error }: { label: string; error?: boolean }) {
  return (
    <span
      className={`flex items-center gap-2 text-xs ${error ? "text-destructive" : "text-foreground/60"}`}
    >
      {error ? (
        <SearchXIcon className="size-3.5" />
      ) : (
        <LoaderIcon className="size-3.5 animate-spin" />
      )}
      {label}
    </span>
  );
}

/**
 * Araç sonucunu karta çevirir. Çalışırken kısa bir durum satırı, bitince aracın kartı; yazma araçları onay
 * kartı olur. `wide`: tam ekran görünüm (daha çok satır/kapak).
 */
export function ToolCard({
  part,
  wide,
  onRespond,
  onOpenDeck,
}: {
  part: ToolPart;
  wide?: boolean;
  onRespond: (approvalId: string, approved: boolean) => void;
  onOpenDeck: () => void;
}) {
  const name = toolNameOf(part);
  if (WRITE_TOOLS.has(name)) return <ProposalCard part={part} onRespond={onRespond} />;
  if (part.state === "input-streaming" || part.state === "input-available") {
    return <ToolStatus label={toolRunningLabel(name)} />;
  }
  if (part.state === "output-error") return <ToolStatus label={m.ai_card_not_found()} error />;
  if (part.state !== "output-available") return null;
  const output = part.output as unknown;
  if (output && typeof output === "object" && "error" in output) {
    return <ToolStatus label={m.ai_card_not_found()} error />;
  }

  switch (part.type) {
    case "tool-queryLibrary":
      return <LibraryCard output={part.output as ToolOutput<"queryLibrary">} wide={wide} />;
    case "tool-compareWithUser":
      return <CompareCard output={part.output as ToolOutput<"compareWithUser">} wide={wide} />;
    case "tool-getStats":
      return <StatsCard output={part.output as ToolOutput<"getStats">} />;
    case "tool-getGame":
      return <GameCard output={part.output as ToolOutput<"getGame">} />;
    case "tool-getAchievements":
      return <AchievementsCard output={part.output as ToolOutput<"getAchievements">} />;
    case "tool-getPlayHistory":
      return <PlayHistoryCard output={part.output as ToolOutput<"getPlayHistory">} />;
    case "tool-suggestFromBacklog":
      return (
        <BacklogCard
          output={part.output as ToolOutput<"suggestFromBacklog">}
          onOpenDeck={onOpenDeck}
        />
      );
    case "tool-listInbox":
      return <InboxCard output={part.output as ToolOutput<"listInbox">} />;
    case "tool-listPlayers":
      return <PlayersCard output={part.output as ToolOutput<"listPlayers">} />;
    case "tool-searchCatalog":
      return <CatalogCard output={part.output as ToolOutput<"searchCatalog">} />;
    default:
      return null;
  }
}
