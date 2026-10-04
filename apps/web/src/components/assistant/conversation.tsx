import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcwIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  type AssistantUIMessage,
  assistantErrorText,
  isToolPart,
  suggestionsQuery,
  toolNameOf,
  toolRunningLabel,
} from "@/lib/assistant";
import { chatThreadQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { focusMood, getChat } from "./chat-store";
import { Composer } from "./composer";
import { Greeting } from "./greeting";
import { LivePaddie, Paddie } from "./mascot";
import { usePaddieMood } from "./mascot-store";
import { MessageView, TypingDots } from "./message";
import { useAssistant } from "./provider";

/**
 * Paddie'nin çalışma sahnesi: sohbet bir şey yaparken (düşünüyor, araç çalıştırıyor, yazıyor, onay bekliyor,
 * az önce uyguladı) mesajların altında büyük Paddie ve ne yaptığı. Mesaj başlığındaki küçük Paddie hareketsizdir;
 * hareketler burada okunur.
 */
function PaddieStage({ tool, glow }: { tool: string | null; glow: string | null }) {
  const mood = usePaddieMood();
  const label =
    mood === "working"
      ? `${tool ? toolRunningLabel(tool) : m.ai_thinking().replace(/…$/, "")}…`
      : mood === "talking"
        ? m.ai_mascot_talking()
        : mood === "approval"
          ? m.ai_mascot_waiting()
          : mood === "success"
            ? m.ai_mascot_done()
            : m.ai_thinking();
  const dots = mood === "thinking" || mood === "working" || mood === "talking";
  return (
    <div className="animate-pop flex items-center gap-3" role="status">
      <LivePaddie size={68} glow={glow} />
      <span className="text-foreground/75 grid gap-0.5 text-[13px]">
        <span className="text-foreground text-sm font-bold">{m.ai_name()}</span>
        {dots ? <TypingDots label={label} /> : <span>{label}</span>}
      </span>
    </div>
  );
}

/**
 * Bir sohbet: mesajlar (ya da boşsa karşılama) ve mesaj kutusu. Panel de tam ekran görünüm de bunu kullanır;
 * ikisi aynı `Chat` örneğini paylaştığı için biri açıkken diğerine geçince akış kesilmez.
 */
export function Conversation({
  threadId,
  wide,
  autoFocus,
}: {
  threadId: string;
  wide?: boolean;
  autoFocus?: boolean;
}) {
  const assistant = useAssistant();
  const queryClient = useQueryClient();
  const chat = getChat(threadId, queryClient);
  const {
    messages,
    status,
    error,
    setMessages,
    addToolApprovalResponse,
    stop,
    sendMessage,
    regenerate,
    clearError,
  } = useChat<AssistantUIMessage>({ chat, throttle: 40 });
  const busy = status === "submitted" || status === "streaming";
  const existing = assistant.isKnownThread(threadId);
  const history = useQuery({
    ...chatThreadQuery(threadId),
    enabled: existing && messages.length === 0 && !busy,
  });

  // Kayıtlı sohbet açılınca geçmiş yüklenir (yeni sohbette ilk mesaj henüz kaydedilmemiş olabilir).
  useEffect(() => {
    if (history.data && chat.messages.length === 0) {
      setMessages(history.data.messages as AssistantUIMessage[]);
    }
  }, [history.data, chat, setMessages]);

  // Paddie açık sohbetin hâlini gösterir (başka bir sohbette akış sürüyorsa da ona geçer).
  useEffect(() => focusMood(threadId), [threadId]);

  // Silinmiş/başkasının sohbeti: temiz bir sohbetle devam.
  useEffect(() => {
    if (history.error instanceof ApiError && history.error.status === 404) assistant.newThread();
  }, [history.error, assistant]);

  // Yeni mesajlar gelince, kullanıcı yukarıda okumuyorsa en alta kaydırılır.
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: mesajlar değişince kaydır
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [messages, status]);

  const last = messages.at(-1);
  const errorText = assistantErrorText(error);
  const glow = useQuery({ ...suggestionsQuery(assistant.page), enabled: assistant.enabled }).data
    ?.pageGame?.accentColor;
  const mood = usePaddieMood();

  // Sahnedeki yazı için son çalışan araç; araç bitip Paddie bir an daha "çalışıyor"da kalsa da adı kaybolmasın.
  const lastTool = useRef<string | null>(null);
  const tools = last?.role === "assistant" ? last.parts.filter(isToolPart) : [];
  const running = tools.find(
    (part) => part.state === "input-streaming" || part.state === "input-available",
  );
  if (running) lastTool.current = toolNameOf(running);
  const pendingApproval = tools.some(
    (part) =>
      part.state === "approval-requested" &&
      !(part as { approval?: { isAutomatic?: boolean } }).approval?.isAutomatic,
  );
  const staged = !errorText && (busy || pendingApproval || mood === "success");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [scrollbar-width:thin]"
      >
        <div className={`mx-auto grid w-full gap-[18px] py-4 ${wide ? "max-w-[720px]" : ""}`}>
          {messages.length === 0 && !history.isFetching ? (
            <Greeting />
          ) : (
            messages.map((message) => (
              <MessageView
                key={message.id}
                message={message}
                live={message.id === last?.id}
                wide={wide}
                onRespond={(id, approved) => void addToolApprovalResponse({ id, approved })}
                onOpenDeck={assistant.openPick}
              />
            ))
          )}
          {staged && <PaddieStage tool={lastTool.current} glow={glow ?? null} />}
          {errorText && (
            <div className="border-destructive/35 bg-destructive/8 flex items-center gap-3 rounded-2xl border p-3 text-sm">
              <Paddie mood="error" size={44} />
              <span className="flex-1">{errorText}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearError();
                  void regenerate();
                }}
              >
                <RotateCcwIcon />
                {m.ai_retry()}
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className={`mx-auto w-full px-3 pt-1 pb-3 ${wide ? "max-w-[744px]" : ""}`}>
        <Composer
          threadId={threadId}
          busy={busy}
          hasMessages={messages.length > 0}
          autoFocus={autoFocus}
          onStop={() => void stop()}
          onSend={({ text, mentions, command, withoutPage }) => {
            pinned.current = true;
            assistant.selectThread(threadId);
            assistant.markKnown(threadId);
            void sendMessage({
              text,
              metadata: {
                mode: assistant.mode,
                page: withoutPage ? undefined : assistant.page,
                mentions: mentions.length ? mentions : undefined,
                command,
              },
            });
          }}
        />
      </div>
    </div>
  );
}
