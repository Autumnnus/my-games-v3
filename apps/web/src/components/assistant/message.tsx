import { CheckCheckIcon, HashIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  type AssistantUIMessage,
  COMMANDS,
  isToolPart,
  type Mention,
  type ToolPart,
  toolDoneLabel,
  toolNameOf,
  toolRunningLabel,
} from "@/lib/assistant";
import { statusLabel } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { ToolCard } from "./cards/tool-card";
import { Orb } from "./orb";

/** `**kalın**`, `*eğik*`, `` `kod` `` — modelin ara sıra kullandığı kadarı; geri kalanı düz metin. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = match[0];
    const id = `${key}-${index++}`;
    if (token.startsWith("**")) out.push(<strong key={id}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))
      out.push(
        <code key={id} className="rounded bg-white/8 px-1 text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    else out.push(<em key={id}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraflar ve kısa listeler. HTML hiçbir zaman yorumlanmaz (React metni kaçırır). */
export function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="grid gap-2 text-[15px] leading-relaxed text-pretty">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n");
        const listed = lines.every((line) => /^\s*([-*•]|\d+[.)])\s+/.test(line));
        const key = `b${blockIndex}`;
        if (listed) {
          const ordered = /^\s*\d/.test(lines[0] ?? "");
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={key} className={`grid gap-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
              {lines.map((line, lineIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: metin satırları; sırası hiç değişmez
                <li key={`${key}-${lineIndex}`}>
                  {inline(line.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${key}-${lineIndex}`)}
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={key} className="m-0 whitespace-pre-line">
            {inline(block, key)}
          </p>
        );
      })}
    </div>
  );
}

function MentionChip({ mention }: { mention: Mention }) {
  return (
    <span className="mr-1 inline-flex h-6 items-center gap-1.5 rounded-full bg-white/12 px-2 align-[-4px] text-[13px] font-bold">
      {mention.type === "user" ? (
        <span className="flex size-4 items-center justify-center rounded-full bg-[#c2552d] text-[9px]">
          {mention.label.slice(0, 1).toUpperCase()}
        </span>
      ) : (
        <HashIcon className="size-3 opacity-70" />
      )}
      {mention.type === "status" ? statusLabel(mention.status) : mention.label}
    </span>
  );
}

function UserBubble({ message }: { message: AssistantUIMessage }) {
  const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  const mentions = message.metadata?.mentions ?? [];
  const command = COMMANDS.find((item) => item.id === message.metadata?.command);
  const act = message.metadata?.mode === "act";
  return (
    <div
      className={`animate-pop max-w-[85%] justify-self-end rounded-[18px] rounded-br-md border px-3.5 py-2.5 text-[15px] leading-relaxed ${
        act ? "border-[#f2c77a]/22 bg-[#f2c77a]/14" : "border-transparent bg-white/9"
      }`}
    >
      {command && (
        <span className="mr-1 inline-flex h-6 items-center rounded-full bg-white/12 px-2 align-[-4px] font-mono text-[12px] font-bold text-[#f2c77a]">
          {command.name()}
        </span>
      )}
      {mentions.map((mention) => (
        <MentionChip key={`${mention.type}-${mention.label}`} mention={mention} />
      ))}
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  );
}

/**
 * Asistanın bir mesajı: başlıkta kullandığı araçların özeti, sonra parçalar sırasıyla (metin → kart).
 * Birden çok öneri onay bekliyorsa altta "Hepsini onayla".
 */
function AssistantMessage({
  message,
  streaming,
  wide,
  accent,
  onRespond,
  onOpenDeck,
}: {
  message: AssistantUIMessage;
  streaming: boolean;
  wide?: boolean;
  accent?: string | null;
  onRespond: (approvalId: string, approved: boolean) => void;
  onOpenDeck: () => void;
}) {
  const tools = message.parts.filter(isToolPart) as ToolPart[];
  const done = [
    ...new Set(
      tools
        .filter((part) => part.state === "output-available")
        .map((part) => toolDoneLabel(toolNameOf(part))),
    ),
  ];
  const running = tools.find(
    (part) => part.state === "input-streaming" || part.state === "input-available",
  );
  const hasText = message.parts.some((part) => part.type === "text" && part.text.trim());
  const pending = tools.filter(
    (part) =>
      part.state === "approval-requested" &&
      !(part as { approval?: { isAutomatic?: boolean } }).approval?.isAutomatic,
  );

  return (
    <div className="grid gap-2.5">
      <div className="text-foreground/62 flex items-center gap-2 text-xs">
        <Orb color={accent} size={22} />
        <span className="text-foreground font-bold">{m.ai_name()}</span>
        {running && streaming ? (
          <span>{toolRunningLabel(toolNameOf(running))}…</span>
        ) : done.length > 0 ? (
          <span className="truncate">{done.join(" · ")}</span>
        ) : streaming && !hasText ? (
          <TypingDots />
        ) : null}
      </div>
      {message.parts.map((part, index) => {
        const key = `${message.id}-${index}`;
        if (part.type === "text") {
          return part.text.trim() ? <RichText key={key} text={part.text} /> : null;
        }
        if (isToolPart(part)) {
          return (
            <ToolCard
              key={key}
              part={part}
              wide={wide}
              onRespond={onRespond}
              onOpenDeck={onOpenDeck}
            />
          );
        }
        return <Fragment key={key} />;
      })}
      {pending.length > 1 && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="ghost"
            className="h-10 border border-[#f2c77a]/50 bg-[#f2c77a]/12 text-[#f2c77a] hover:bg-[#f2c77a]/20"
            onClick={() => {
              for (const part of pending) {
                const id = (part as { approval?: { id: string } }).approval?.id;
                if (id) onRespond(id, true);
              }
            }}
          >
            <CheckCheckIcon />
            {m.ai_proposal_approve_all({ count: pending.length })}
          </Button>
          <span className="text-foreground/62 text-xs">{m.ai_proposal_hint()}</span>
        </div>
      )}
    </div>
  );
}

export function TypingDots({ label }: { label?: string }) {
  return (
    <span className="flex items-center gap-2" role="status">
      {label && <span>{label}</span>}
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="animate-typing bg-foreground size-1.5 rounded-full"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="sr-only">{m.ai_thinking()}</span>
    </span>
  );
}

export function MessageView(props: {
  message: AssistantUIMessage;
  streaming: boolean;
  wide?: boolean;
  accent?: string | null;
  onRespond: (approvalId: string, approved: boolean) => void;
  onOpenDeck: () => void;
}) {
  if (props.message.role === "user") return <UserBubble message={props.message} />;
  if (props.message.role !== "assistant") return null;
  return <AssistantMessage {...props} />;
}
