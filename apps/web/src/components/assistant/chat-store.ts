import { Chat } from "@ai-sdk/react";
import type { QueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { type AssistantUIMessage, isToolPart, toolNameOf, WRITE_TOOLS } from "@/lib/assistant";
import { aiUsageQuery, chatThreadsQuery } from "@/lib/queries";
import { getLocale } from "@/paraglide/runtime";

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
    if (cache) chats.set(id, chat);
  }
  return chat;
}

/** Sohbet şu an cevap bekliyor/akıyor mu, içinde mesaj var mı (yeni sohbet açma kararı için). */
export function chatState(id: string) {
  const chat = chats.get(id);
  return {
    busy: chat?.status === "streaming" || chat?.status === "submitted",
    hasMessages: (chat?.messages.length ?? 0) > 0,
  };
}
