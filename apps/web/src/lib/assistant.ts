import type {
  ApprovalPreview,
  AssistantCommand,
  AssistantMode,
  AssistantUIMessage,
  Mention,
  PageContext,
} from "@my-games/api";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { api, unwrap } from "./api";

export type {
  ApprovalPreview,
  AssistantCommand,
  AssistantMode,
  AssistantUIMessage,
  Mention,
  PageContext,
};

export type AssistantPart = AssistantUIMessage["parts"][number];
export type ToolPart = Extract<AssistantPart, { type: `tool-${string}` }>;
export type ToolName = ToolPart["type"] extends `tool-${infer Name}` ? Name : never;
export type ToolPartOf<Name extends ToolName> = Extract<ToolPart, { type: `tool-${Name}` }>;
/** Aracın başarılı çıktısı (hata nesnesi `{ error }` hariç). */
export type ToolOutput<Name extends ToolName> = Exclude<
  NonNullable<ToolPartOf<Name>["output"]>,
  { error: string }
>;

export function isToolPart(part: AssistantPart): part is ToolPart {
  return part.type.startsWith("tool-");
}

export function toolNameOf(part: ToolPart) {
  return part.type.slice("tool-".length) as ToolName;
}

export const WRITE_TOOLS = new Set<ToolName>(["updateEntry", "addToLibrary", "resolveInbox"]);

/** Onay isteğinin `requestReason`'ında taşınan önizleme (sunucu JSON yazar). */
export function approvalPreview(part: ToolPart): ApprovalPreview | null {
  const reason = (part as { approval?: { requestReason?: string; reason?: string } }).approval;
  const raw = reason?.requestReason ?? reason?.reason;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ApprovalPreview;
    return parsed && (parsed.kind === "entry" || parsed.kind === "inbox") ? parsed : null;
  } catch {
    return null;
  }
}

// --- Sayfa bağlamı ---

type Match = { routeId: string; params: Record<string, string> };

/** Yönlendiricinin eşleşmelerinden asistanın sayfa bağlamı (en özel eşleşme kazanır). */
export function pageContextOf(matches: Match[]): PageContext | undefined {
  for (const match of [...matches].reverse()) {
    switch (match.routeId) {
      case "/g/$slug":
        return match.params.slug ? { type: "game", slug: match.params.slug } : undefined;
      case "/e/$id":
        return match.params.id ? { type: "entry", id: match.params.id } : undefined;
      case "/u/$username":
      case "/u/$username/":
      case "/u/$username/library":
      case "/u/$username/stats":
      case "/u/$username/activity":
      case "/u/$username/screenshots":
      case "/u/$username/wrapped/$year":
        return match.params.username
          ? { type: "profile", username: match.params.username }
          : undefined;
      case "/stats":
        return { type: "stats" };
      case "/_authed/inbox":
        return { type: "inbox" };
      case "/":
        return { type: "home" };
    }
  }
  return undefined;
}

// --- Sorgular ---

export const suggestionsQuery = (page: PageContext | undefined) =>
  queryOptions({
    queryKey: ["ai", "suggestions", page ?? null],
    queryFn: () =>
      unwrap(
        api.ai.suggestions.$get({
          query: page
            ? {
                type: page.type,
                slug: page.type === "game" ? page.slug : undefined,
                id: page.type === "entry" ? page.id : undefined,
                username: page.type === "profile" ? page.username : undefined,
              }
            : {},
        }),
      ),
    staleTime: 60_000,
    // Sayfa değişince yenisi gelene kadar öncekiler kalsın; küre rengi ve karşılama bölümleri yanıp sönmesin.
    placeholderData: keepPreviousData,
  });

export const mentionsQuery = (q: string) =>
  queryOptions({
    queryKey: ["ai", "mentions", q.trim().toLocaleLowerCase()],
    queryFn: () => unwrap(api.ai.mentions.$get({ query: { q: q.trim() || undefined } })),
    staleTime: 30_000,
  });

export const recapQuery = (entryId: string) =>
  queryOptions({
    queryKey: ["ai", "recap", entryId],
    queryFn: () => unwrap(api.ai.recap[":id"].$get({ param: { id: entryId } })),
    staleTime: 10 * 60_000,
    retry: false,
  });

export const smartListsQuery = (username: string) =>
  queryOptions({
    queryKey: ["lists", username.toLowerCase()],
    queryFn: () => unwrap(api.users[":username"].lists.$get({ param: { username } })),
  });

export type Suggestions = Awaited<
  ReturnType<NonNullable<ReturnType<typeof suggestionsQuery>["queryFn"]>>
>;
export type Suggestion = Suggestions["forPage"][number];
export type MentionCandidates = Awaited<
  ReturnType<NonNullable<ReturnType<typeof mentionsQuery>["queryFn"]>>
>;
export type Recap = Awaited<ReturnType<NonNullable<ReturnType<typeof recapQuery>["queryFn"]>>>;
export type SmartList = Awaited<
  ReturnType<NonNullable<ReturnType<typeof smartListsQuery>["queryFn"]>>
>["lists"][number];

// --- Komutlar ---

export type CommandInfo = {
  id: AssistantCommand;
  name: () => string;
  description: () => string;
  /** Yalnızca "Yap" modunda anlamlı. */
  act?: boolean;
};

export const COMMANDS: CommandInfo[] = [
  { id: "pick", name: m.ai_cmd_name_pick, description: m.ai_cmd_pick },
  { id: "compare", name: m.ai_cmd_name_compare, description: m.ai_cmd_compare },
  { id: "recap", name: m.ai_cmd_name_recap, description: m.ai_cmd_recap },
  { id: "summary", name: m.ai_cmd_name_summary, description: m.ai_cmd_summary },
  { id: "review", name: m.ai_cmd_name_review, description: m.ai_cmd_review },
  { id: "status", name: m.ai_cmd_name_status, description: m.ai_cmd_status, act: true },
  { id: "inbox", name: m.ai_cmd_name_inbox, description: m.ai_cmd_inbox },
];

// --- Metinler ---

export function greetingFor(name: string, date = new Date()) {
  const hour = date.getHours();
  const first = name.split(/\s+/)[0] ?? name;
  if (hour >= 5 && hour < 12) return m.ai_greeting_morning({ name: first });
  if (hour >= 12 && hour < 18) return m.ai_greeting_afternoon({ name: first });
  if (hour >= 18 && hour < 23) return m.ai_greeting_evening({ name: first });
  return m.ai_greeting_night({ name: first });
}

const TOOL_RUNNING: Record<string, () => string> = {
  queryLibrary: m.ai_tool_queryLibrary,
  getStats: m.ai_tool_getStats,
  getGame: m.ai_tool_getGame,
  compareWithUser: m.ai_tool_compareWithUser,
  getAchievements: m.ai_tool_getAchievements,
  getPlayHistory: m.ai_tool_getPlayHistory,
  suggestFromBacklog: m.ai_tool_suggestFromBacklog,
  listInbox: m.ai_tool_listInbox,
  listPlayers: m.ai_tool_listPlayers,
  searchCatalog: m.ai_tool_searchCatalog,
  updateEntry: m.ai_tool_updateEntry,
  addToLibrary: m.ai_tool_addToLibrary,
  resolveInbox: m.ai_tool_resolveInbox,
};

const TOOL_DONE: Record<string, () => string> = {
  queryLibrary: m.ai_tooldone_queryLibrary,
  getStats: m.ai_tooldone_getStats,
  getGame: m.ai_tooldone_getGame,
  compareWithUser: m.ai_tooldone_compareWithUser,
  getAchievements: m.ai_tooldone_getAchievements,
  getPlayHistory: m.ai_tooldone_getPlayHistory,
  suggestFromBacklog: m.ai_tooldone_suggestFromBacklog,
  listInbox: m.ai_tooldone_listInbox,
  listPlayers: m.ai_tooldone_listPlayers,
  searchCatalog: m.ai_tooldone_searchCatalog,
  updateEntry: m.ai_tooldone_updateEntry,
  addToLibrary: m.ai_tooldone_addToLibrary,
  resolveInbox: m.ai_tooldone_resolveInbox,
};

export const toolRunningLabel = (name: string) => (TOOL_RUNNING[name] ?? m.ai_thinking)();
export const toolDoneLabel = (name: string) => (TOOL_DONE[name] ?? (() => name))();

/** Akış/istek hatasını kullanıcıya gösterilecek metne çevirir (sunucu kısa kod yollar). */
export function assistantErrorText(error: Error | undefined) {
  if (!error) return null;
  const message = error.message ?? "";
  if (message.includes("quota_exceeded")) return m.ai_error_quota();
  if (message.includes("ai_blocked")) return m.ai_error_blocked();
  const busy = message.match(/ai_busy(?::(\S+))?/);
  if (busy) {
    const at = busy[1] ? new Date(busy[1]) : null;
    if (at && !Number.isNaN(at.getTime())) {
      const minutes = Math.max(1, Math.round((at.getTime() - Date.now()) / 60_000));
      return m.ai_error_busy({ minutes: String(minutes) });
    }
    return m.ai_error_busy_soon();
  }
  if (message.includes("rate_limited")) return m.error_rate_limited();
  return m.ai_error();
}

/** Onay/diff alan adları (sunucu kullanıcı birimleriyle yollar: puan 0–10, süre saat). */
export const FIELD_LABELS: Record<string, () => string> = {
  status: m.ai_field_status,
  rating: m.ai_field_rating,
  review: m.ai_field_review,
  favorite: m.ai_field_favorite,
  startedAt: m.ai_field_startedAt,
  finishedAt: m.ai_field_finishedAt,
  playtimeHours: m.ai_field_playtimeHours,
  lastPlayedAt: m.ai_field_lastPlayedAt,
};

// --- Geri alma ---

/**
 * Az önce yapılan düzenlemenin geçmiş kaydı. Asistanın akışlarındaki "Geri al" düğmeleri uygulamanın
 * kanonik geri alma yolunu kullanır (geçmiş kaydını geri al: akış etkinliği ve bildirimler de temizlenir).
 */
export async function latestHistoryId(entryId: string) {
  const { history } = await unwrap(api.history.$get({ query: { entryId } }));
  return history.find((item) => item.action === "update" && !item.revertedAt)?.id ?? null;
}

export function revertHistory(historyId: string) {
  return unwrap(api.history[":id"].revert.$post({ param: { id: historyId } }));
}
