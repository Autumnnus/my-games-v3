import { createHmac } from "node:crypto";
import {
  type GenerateTextOnEndCallback,
  type GenerateTextOnStepEndCallback,
  isStepCount,
  type LanguageModel,
  type PrepareStepResult,
  pruneMessages,
  ToolLoopAgent,
} from "ai";
import { appTimeZone, credentialsSecret } from "../config";
import type { AssistantMode, ResolvedContext } from "./context";
import { type AssistantTools, createTools, READ_TOOLS, toolApprovals, WRITE_TOOLS } from "./tools";

export const ASSISTANT_NAME = "Paddie";

export type AgentContext = {
  userId: string;
  name: string;
  username: string;
  locale: string;
  mode: AssistantMode;
  context: ResolvedContext;
  maxSteps: number;
};

/** Prompt bağlamı büyürse (uzun sohbet, büyük araç çıktıları) eski araç çağrıları budanır. */
const COMPACT_AT_CHARS = 120_000;

const STATUS_NAMES: Record<string, Record<string, string>> = {
  tr: {
    playing: "Oynanıyor",
    completed: "Bitirildi",
    paused: "Ara verildi",
    dropped: "Bırakıldı",
    backlog: "Oynanacak",
    wishlist: "İstek listesi",
    endless: "Sürekli oynanan",
  },
  en: {
    playing: "Playing",
    completed: "Completed",
    paused: "Paused",
    dropped: "Dropped",
    backlog: "Backlog",
    wishlist: "Wishlist",
    endless: "Endless",
  },
};

function statusNames(locale: string) {
  const names = STATUS_NAMES[locale] ?? STATUS_NAMES.en ?? {};
  return Object.entries(names)
    .map(([status, name]) => `${status} = "${name}"`)
    .join(", ");
}

function today(locale: string) {
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    timeZone: appTimeZone(),
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

/**
 * Sistem talimatı. İngilizce yazılır (modeller en tutarlı bu dilde uyar); cevap dili kullanıcınınkidir.
 * Bölümler: kimlik, cevabın nasıl gösterildiği, veri kuralları, araç kullanımı, mod ve sayfa bağlamı.
 */
export function assistantInstructions(ctx: AgentContext) {
  const language = ctx.locale === "tr" ? "Turkish" : "English";
  const sections = [
    `You are ${ASSISTANT_NAME}, the assistant inside My games — a site where people track the games they play, rate them (0–10), write reviews and follow each other's activity.`,
    `Your persona: the site's mascot, a little purple gamepad come to life (the name comes from "gamepad"). You are a warm, playful fellow gamer; a light touch of humor is welcome, but clarity and brevity always come first. Don't describe yourself or your looks unless asked.`,
    `Current user: ${ctx.name} (@${ctx.username}). Today is ${today(ctx.locale)}. Always reply in ${language}.`,

    `## How your answers are shown
- Tool results are rendered as rich cards: cover grids, rating charts, achievement lists, change proposals. Never repeat what a card shows item by item; add the insight in one or two sentences (the pattern, the standout, the direct answer).
- Keep it short: usually 1–3 sentences. Plain text only; a short dash list is fine. No tables, headings, code blocks or links.
- Use the app's status names: ${statusNames(ctx.locale)}.`,

    `## Data rules
- State facts only from tool results or the context below. Never invent games, ratings, hours, dates or achievements. If something is missing, say so plainly.
- Ratings are 0–10 with one decimal; playtime is in hours. Write dates naturally.
- Libraries on My games are public, so you may read other users' libraries through the tools.
- For facts about a game itself (story, mechanics, tips) you may use general knowledge; be brief, avoid spoilers unless asked, and say when you are unsure.`,

    `## The app (for "how do I…" questions)
- Games come in three ways: linking Steam, PlayStation or Xbox in Settings (synced changes wait in the Inbox for approval), searching with "Add game", or asking you in Act mode.
- Other places: the library with status filters and smart lists, profile and stats pages, Wrapped (yearly recap), the activity feed with likes and comments, ⌘K search, and the "Ne oynasam?" pick deck.`,

    `## Tools
- Prefer one well-filtered call to many. queryLibrary handles statuses, rating and hour ranges, genre, finish year, favorites, name and sorting; use it for every "which games…" question and give it a short title.
- Use the ids from the context when you have them. Don't call the same tool with the same input twice.
- For "what should I play" questions, use suggestFromBacklog (the app also has a guided "Ne oynasam?" deck).`,

    ctx.mode === "act"
      ? `## Mode: Act — changes need the user's approval
You may change the current user's own library with updateEntry, addToLibrary and resolveInbox. Each change appears as a proposal card and happens only after the user approves it; it can be undone later.
- First find the exact entry (context ids, queryLibrary, or searchCatalog for new games). Then call the write tool once per game with only the fields that change.
- Before the tool calls, write one short sentence saying what you prepared. Don't ask for confirmation in text — the card is the confirmation.
- Map everyday language to statuses: finished → completed, gave up/dropped → dropped, started/playing → playing, taking a break → paused, want to play later → backlog, want to buy → wishlist.
- If a change is denied, acknowledge it briefly and don't try it again.
- After changes are applied, confirm in a sentence and, when it fits, offer one natural next step (for a finished game: writing a short review).`
      : `## Mode: Ask — read-only
You can only read data right now. If the user wants to change something (status, rating, review, adding a game, approvals), tell them in one sentence to switch to "Yap" (the Act toggle under the message box) and ask again — don't explain manual steps.`,
  ];
  if (ctx.context.lines.length > 0) {
    sections.push(`## Context\n${ctx.context.lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

/**
 * Onay imzası anahtarı: onay istekleri sunucuda HMAC ile imzalanır, istemcinin uydurduğu ya da
 * değiştirdiği bir onay reddedilir. Uygulamanın ana gizli anahtarından türetilir (ayrı bir değişken yok).
 */
export function approvalSecret() {
  return createHmac("sha256", credentialsSecret())
    .update("my-games:ai-tool-approval")
    .digest("base64url");
}

/**
 * Asistan agent'ı. İstek başına kurulur (hafif bir nesne); kullanıcı ve mod araçlara closure ile verilir.
 *
 * Döngü:
 * - `stopWhen`: adım sınırı (maliyet ve kaçak döngü güvencesi).
 * - `prepareStep`: son adımda araçlar kapanır (döngü cevapsız bitmesin); aynı araç aynı girdiyle üçüncü kez
 *   çağrılmak üzereyse model cevap vermeye zorlanır; bağlam büyüyünce eski araç çıktıları budanır.
 * - Yazma araçları yalnızca "Yap" modunda etkin ve onaya tabi (`toolApproval`).
 */
export function createAssistantAgent(input: {
  model: LanguageModel;
  ctx: AgentContext;
  onStepEnd?: GenerateTextOnStepEndCallback<AssistantTools>;
  onEnd?: GenerateTextOnEndCallback<AssistantTools>;
}) {
  const { ctx } = input;
  const tools = createTools({ userId: ctx.userId, locale: ctx.locale });
  const activeTools: Array<keyof AssistantTools> =
    ctx.mode === "act" ? [...READ_TOOLS, ...WRITE_TOOLS] : [...READ_TOOLS];
  const lastStep = ctx.maxSteps - 1;

  return new ToolLoopAgent({
    model: input.model,
    instructions: assistantInstructions(ctx),
    tools,
    activeTools,
    toolApproval: toolApprovals({ userId: ctx.userId, locale: ctx.locale }),
    experimental_toolApprovalSecret: approvalSecret(),
    stopWhen: isStepCount(ctx.maxSteps),
    maxOutputTokens: 1500,
    maxRetries: 1,
    prepareStep: ({ stepNumber, steps, messages }): PrepareStepResult<AssistantTools> => {
      if (stepNumber >= lastStep) return { toolChoice: "none" };

      const seen = new Map<string, number>();
      for (const call of steps.flatMap((step) => step.toolCalls)) {
        const key = `${call.toolName}:${JSON.stringify(call.input)}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      if ([...seen.values()].some((count) => count >= 2)) return { toolChoice: "none" };

      if (JSON.stringify(messages).length > COMPACT_AT_CHARS) {
        return {
          messages: pruneMessages({
            messages,
            reasoning: "all",
            toolCalls: "before-last-2-messages",
            emptyMessages: "remove",
          }),
        };
      }
      return {};
    },
    onStepEnd: input.onStepEnd,
    onEnd: input.onEnd,
  });
}

export type AssistantAgent = ReturnType<typeof createAssistantAgent>;
