import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import { LoaderIcon, PlusIcon, SendIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as z from "zod/mini";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api";
import { metaQuery } from "@/lib/meta";
import { aiUsageQuery, chatThreadQuery, chatThreadsQuery } from "@/lib/queries";
import { uuid } from "@/lib/uuid";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

export const Route = createFileRoute("/_authed/chat")({
  validateSearch: z.object({ t: z.optional(z.uuid()) }),
  head: () => ({ meta: [{ title: `${m.chat_title()} · ${m.app_name()}` }] }),
  component: ChatPage,
});

const toolLabels: Record<string, () => string> = {
  searchLibrary: m.tool_searchLibrary,
  getStats: m.tool_getStats,
  getGame: m.tool_getGame,
  compareWithUser: m.tool_compareWithUser,
  suggestFromBacklog: m.tool_suggestFromBacklog,
  listPlayers: m.tool_listPlayers,
};

function ChatPage() {
  const { t } = Route.useSearch();
  const meta = useQuery(metaQuery);
  // Yeni sohbetin kimliği istemcide üretilir; ilk mesajla sunucuda oluşur.
  const [draftId] = useState(() => uuid());
  const threadId = t ?? draftId;

  if (meta.data && !meta.data.features.ai) {
    return (
      <Alert>
        <AlertDescription>{m.chat_disabled()}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <ThreadList activeId={t} />
      <ChatWindow key={threadId} threadId={threadId} existing={!!t} />
    </div>
  );
}

function ThreadList({ activeId }: { activeId?: string }) {
  const { data } = useQuery(chatThreadsQuery);
  return (
    <aside className="grid content-start gap-2">
      <Button asChild variant="outline" size="sm" className="justify-start">
        <Link to="/chat" search={{}}>
          <PlusIcon />
          {m.chat_new()}
        </Link>
      </Button>
      <nav className="grid gap-0.5">
        {data?.threads.length === 0 && (
          <p className="text-muted-foreground px-2 text-xs">{m.chat_no_threads()}</p>
        )}
        {data?.threads.map((thread) => (
          <Link
            key={thread.id}
            to="/chat"
            search={{ t: thread.id }}
            className={`hover:bg-accent truncate rounded px-2 py-1.5 text-sm ${
              thread.id === activeId ? "bg-accent" : "text-muted-foreground"
            }`}
          >
            {thread.title ?? m.chat_new()}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function ChatWindow({ threadId, existing }: { threadId: string; existing: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Geçmiş sadece var olan bir sohbet açılınca yüklenir. Yeni sohbette ilk mesajdan sonra URL'e kimlik
  // eklenir; o anda yüklemek henüz kaydedilmemiş mesajları ekrandan silerdi.
  const [openedExisting] = useState(existing);
  const thread = useQuery({ ...chatThreadQuery(threadId), enabled: openedExisting });
  const usage = useQuery(aiUsageQuery);
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/v1/ai/chat",
        credentials: "include",
        headers: { "Accept-Language": getLocale() },
        // Geçmiş sunucuda tutulur; sadece son mesaj gönderilir.
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: { id, message: messages.at(-1) },
        }),
      }),
    [],
  );

  const chat = useChat({
    id: threadId,
    transport,
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: chatThreadsQuery.queryKey });
      void queryClient.invalidateQueries({ queryKey: aiUsageQuery.queryKey });
    },
  });

  // Kayıtlı sohbet açıldığında geçmişi yükle.
  const { setMessages } = chat;
  useEffect(() => {
    if (thread.data) setMessages(thread.data.messages as UIMessage[]);
  }, [thread.data, setMessages]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mesajlar değişince aşağı kaydır
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages]);

  const remove = useMutation({
    mutationFn: () => unwrap(api.ai.threads[":id"].$delete({ param: { id: threadId } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: chatThreadsQuery.queryKey });
      await navigate({ to: "/chat", search: {} });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || chat.status === "streaming" || chat.status === "submitted") return;
    setInput("");
    void chat.sendMessage({ text });
    if (!existing) void navigate({ to: "/chat", search: { t: threadId }, replace: true });
  }

  const busy = chat.status === "submitted" || chat.status === "streaming";

  return (
    <section className="flex min-h-[60dvh] flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{m.chat_title()}</h1>
        <div className="flex items-center gap-2">
          {usage.data && usage.data.limit > 0 && (
            <span className="text-muted-foreground text-xs">
              {m.chat_usage({
                used: usage.data.used.toLocaleString(getLocale()),
                limit: usage.data.limit.toLocaleString(getLocale()),
              })}
            </span>
          )}
          {existing && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={m.chat_delete()}
              onClick={() => remove.mutate()}
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        {chat.messages.length === 0 && (
          <p className="text-muted-foreground text-sm">{m.chat_empty()}</p>
        )}
        {chat.messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`grid max-w-[85%] gap-2 rounded-lg px-3 py-2 text-sm ${
                message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {message.parts.map((part, index) => {
                const key = `${message.id}-${index}`;
                if (part.type === "text") {
                  return (
                    <p key={key} className="leading-relaxed whitespace-pre-wrap">
                      {part.text}
                    </p>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  const name = part.type.slice(5);
                  const state = (part as { state?: string }).state;
                  const done = state === "output-available" || state === "output-error";
                  return (
                    <span
                      key={key}
                      className="text-muted-foreground flex items-center gap-1.5 text-xs"
                    >
                      {!done && <LoaderIcon className="size-3 animate-spin" />}
                      {(toolLabels[name] ?? (() => name))()}
                      {done ? " ✓" : "…"}
                    </span>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {chat.status === "submitted" && (
          <LoaderIcon className="text-muted-foreground size-4 animate-spin" />
        )}
        {chat.error && (
          <Alert variant="destructive">
            <AlertDescription>{m.chat_error()}</AlertDescription>
          </Alert>
        )}
        <div ref={bottom} />
      </div>

      <form className="sticky bottom-0 flex items-end gap-2 bg-background pb-2" onSubmit={onSubmit}>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={m.chat_placeholder()}
          rows={2}
          maxLength={4000}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {busy ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void chat.stop()}
            aria-label={m.chat_stop()}
          >
            <SquareIcon />
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} aria-label={m.chat_send()}>
            <SendIcon />
          </Button>
        )}
      </form>
    </section>
  );
}
