import { Chat } from "@ai-sdk/react";
import type { QueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { type AssistantUIMessage, isToolPart, toolNameOf, WRITE_TOOLS } from "@/lib/assistant";
import { aiUsageQuery, chatThreadsQuery } from "@/lib/queries";
import { getLocale } from "@/paraglide/runtime";
import { flashSuccess, type PaddieMood, setChatMood } from "./mascot-store";

/**
 * Sohbet örnekleri (AI SDK `Chat`). Modül düzeyinde tutulur: panel, tam ekran görünüm ve karşılama kartları
 * aynı sohbete bağlanır; biri kapanınca akış kesilmez. AI SDK yalnızca bu modülü içeren parçalarla (panel,
 * /ai) yüklenir; asistanı hiç açmayan sayfa ziyaretleri onu indirmez.
 */
const chats = new Map<string, Chat<AssistantUIMessage>>();

/** Yazma araçları çalıştıysa kütüphaneyle ilgili her şey tazelenir (kapaklar, sayaçlar, akış). */
const WRITE_KEYS = [
  ["library"],
  ["entry"],
  ["profile"],
  ["history"],
  ["game"],
  ["feed"],
  ["proposals"],
  ["my-entry"],
  ["stats"],
];

const transport = new DefaultChatTransport<AssistantUIMessage>({
  api: "/api/v1/ai/chat",
  credentials: "include",
  headers: () => ({ "Accept-Language": getLocale() }),
  // Geçmiş sunucuda tutulur; yalnızca son mesaj (ya da onay turunda asistan mesajı) gönderilir.
  prepareSendMessagesRequest: ({ id, messages }) => ({ body: { id, message: messages.at(-1) } }),
});

export function getChat(id: string, queryClient: QueryClient) {
  let chat = chats.get(id);
  // Sunucuda (SSR) önbelleğe alınmaz: her istek rastgele kimlikle yeni bir sohbet açar ve Map, isteğin
  // QueryClient'ını (kullanıcının verisiyle) süreç boyunca tutardı.
  const cache = typeof window !== "undefined";
  if (!chat) {
    chat = new Chat<AssistantUIMessage>({
      id,
      transport,
      // Kartlardaki onay/ret kararlarının hepsi verilince sohbet kendiliğinden devam eder.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onFinish: ({ message }) => {
        void queryClient.invalidateQueries({ queryKey: chatThreadsQuery.queryKey });
        void queryClient.invalidateQueries({ queryKey: aiUsageQuery.queryKey });
        const wrote = message.parts.some(
          (part) =>
            isToolPart(part) &&
            WRITE_TOOLS.has(toolNameOf(part)) &&
            part.state === "output-available",
        );
        if (wrote)
          for (const queryKey of WRITE_KEYS) void queryClient.invalidateQueries({ queryKey });
      },
    });
    if (cache) {
      chats.set(id, chat);
      watchMood(chat);
    }
  }
  return chat;
}

/** Sohbetin o anki hâli Paddie'nin hangi ruh hâlinde olacağını belirler. */
function moodOf(chat: Chat<AssistantUIMessage>): PaddieMood {
  if (chat.error) return "error";
  if (chat.status === "submitted") return "thinking";
  const last = chat.messages.at(-1);
  if (last?.role !== "assistant") return "idle";
  const tools = last.parts.filter(isToolPart);
  if (chat.status === "streaming") {
    if (tools.some((part) => part.state === "input-streaming" || part.state === "input-available"))
      return "working";
    const tail = last.parts.at(-1);
    return tail?.type === "text" && tail.text.trim() ? "talking" : "thinking";
  }
  const waiting = tools.some(
    (part) =>
      part.state === "approval-requested" &&
      !(part as { approval?: { isAutomatic?: boolean } }).approval?.isAutomatic,
  );
  return waiting ? "approval" : "idle";
}

/** Uygulanmış yazma araçlarının sayısı; akış sırasında artınca Paddie sevinir. */
function writesOf(chat: Chat<AssistantUIMessage>) {
  let count = 0;
  for (const message of chat.messages)
    for (const part of message.parts)
      if (
        isToolPart(part) &&
        WRITE_TOOLS.has(toolNameOf(part)) &&
        part.state === "output-available"
      )
        count++;
  return count;
}

/** Ruh hâlini son hareket eden sohbet belirler (panel kapalıyken de başlık düğmesindeki Paddie çalışır). */
let moodOwner: string | null = null;

function watchMood(chat: Chat<AssistantUIMessage>) {
  let writes = writesOf(chat);
  const sync = () => {
    const mood = moodOf(chat);
    if (mood !== "idle" || moodOwner === chat.id) {
      moodOwner = chat.id;
      setChatMood(mood);
    }
    const next = writesOf(chat);
    // Geçmiş yüklenince sayı da artar; yalnızca canlı akışta (onaydan sonra araç çalışınca) sevinir.
    if (next > writes && chat.status !== "ready") flashSuccess();
    writes = next;
  };
  chat["~registerStatusCallback"](sync);
  chat["~registerErrorCallback"](sync);
  chat["~registerMessagesCallback"](sync, 120);
}

/** Açık sohbet değişince Paddie onun hâline geçer (yeni, boş sohbette boşta). */
export function focusMood(id: string) {
  moodOwner = id;
  const chat = chats.get(id);
  setChatMood(chat ? moodOf(chat) : "idle");
}

/** Sohbet şu an cevap bekliyor/akıyor mu, içinde mesaj var mı (yeni sohbet açma kararı için). */
export function chatState(id: string) {
  const chat = chats.get(id);
  return {
    busy: chat?.status === "streaming" || chat?.status === "submitted",
    hasMessages: (chat?.messages.length ?? 0) > 0,
  };
}
