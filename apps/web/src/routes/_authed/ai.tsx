import { gameCoverUrl } from "@my-games/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ListFilterIcon, Minimize2Icon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";
import { Conversation } from "@/components/assistant/conversation";
import { Orb } from "@/components/assistant/orb";
import { useAssistant } from "@/components/assistant/provider";
import { GameCover } from "@/components/game-cover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";
import { smartListsQuery } from "@/lib/assistant";
import { errorMessage } from "@/lib/format";
import { aiUsageQuery, chatThreadsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/ai")({
  validateSearch: z.object({ t: z.optional(z.string()) }),
  head: () => ({ meta: [{ title: `${m.ai_page_title()} · ${m.app_name()}` }] }),
  component: AssistantPage,
});

type Thread = NonNullable<ReturnType<typeof useThreads>["data"]>["threads"][number];

function useThreads() {
  const assistant = useAssistant();
  return useQuery({ ...chatThreadsQuery, enabled: assistant.enabled });
}

function groupOf(date: Date) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= start) return "today";
  if (date.getTime() >= start - 6 * 24 * 60 * 60 * 1000) return "week";
  return "earlier";
}

function ThreadRow({
  thread,
  active,
  onSelect,
}: {
  thread: Thread;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      className={`flex min-h-[50px] w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-colors ${
        active ? "bg-white/9" : "hover:bg-white/6"
      }`}
    >
      {thread.game?.id ? (
        <GameCover
          url={gameCoverUrl(
            { coverImageId: thread.game.coverImageId, coverUrl: thread.game.coverUrl },
            "cover_small",
          )}
          name={thread.game.name ?? ""}
          color={thread.game.accentColor}
          className="w-[26px] shrink-0 rounded-[5px]"
        />
      ) : (
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-white/8">
          <Orb size={14} />
        </span>
      )}
      <span className="grid min-w-0">
        <span className={`truncate text-[13px] ${active ? "font-bold" : "font-semibold"}`}>
          {thread.title ?? m.ai_new_chat()}
        </span>
        {thread.game?.name && (
          <span className="text-foreground/60 truncate text-xs">{thread.game.name}</span>
        )}
      </span>
    </button>
  );
}

function Sidebar() {
  const assistant = useAssistant();
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const threads = useThreads();
  const username = user.displayUsername ?? user.username ?? "";
  const lists = useQuery({ ...smartListsQuery(username), enabled: !!username });
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase();
    const items = (threads.data?.threads ?? []).filter(
      (thread) =>
        !q ||
        (thread.title ?? "").toLocaleLowerCase().includes(q) ||
        (thread.game?.name ?? "").toLocaleLowerCase().includes(q),
    );
    return (["today", "week", "earlier"] as const)
      .map((key) => ({
        key,
        items: items.filter((thread) => groupOf(new Date(thread.updatedAt)) === key),
      }))
      .filter((group) => group.items.length > 0);
  }, [threads.data, filter]);
  const labels = { today: m.ai_group_today, week: m.ai_group_week, earlier: m.ai_group_earlier };

  const select = (id: string) => {
    assistant.selectThread(id);
    void navigate({ to: "/ai", search: { t: id }, replace: true });
  };

  return (
    <nav
      aria-label={m.ai_history()}
      className="hidden min-h-0 flex-col gap-1 overflow-y-auto rounded-3xl border border-white/8 bg-[#111217] p-2.5 lg:flex"
    >
      <Button
        className="mb-1.5 h-11"
        onClick={() => {
          assistant.newThread();
          void navigate({ to: "/ai", search: {}, replace: true });
        }}
      >
        <PlusIcon />
        {m.ai_new_chat()}
      </Button>
      <label className="text-foreground/70 mb-2 flex h-10 items-center gap-2 rounded-xl bg-white/5 px-3">
        <SearchIcon className="size-4" />
        <span className="sr-only">{m.ai_threads_search()}</span>
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={m.ai_threads_search()}
          className="text-foreground placeholder:text-foreground/55 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
      </label>
      {groups.length === 0 && (
        <p className="text-foreground/60 px-2.5 text-xs">{m.ai_no_threads()}</p>
      )}
      {groups.map((group) => (
        <div key={group.key} className="grid gap-0.5">
          <span className="text-foreground/60 px-2.5 pt-2.5 pb-1 text-[11px] font-bold tracking-[0.16em]">
            {labels[group.key]()}
          </span>
          {group.items.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              active={thread.id === assistant.threadId}
              onSelect={() => select(thread.id)}
            />
          ))}
        </div>
      ))}
      {!!lists.data?.lists.length && (
        <div className="grid gap-0.5">
          <span className="text-foreground/60 px-2.5 pt-3 pb-1 text-[11px] font-bold tracking-[0.16em]">
            {m.ai_group_lists()}
          </span>
          {lists.data.lists.map((list) => (
            <Link
              key={list.id}
              to="/u/$username/library"
              params={{ username }}
              search={{ list: list.id }}
              className="flex min-h-[46px] items-center gap-2.5 rounded-xl px-2.5 py-1.5 hover:bg-white/6"
            >
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-white/8">
                <ListFilterIcon className="size-3.5" />
              </span>
              <span className="grid min-w-0">
                <span className="truncate text-[13px] font-semibold">{list.name}</span>
                <span className="text-foreground/60 text-xs">
                  {m.ai_list_count({ count: list.count })}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

function ContextRail() {
  const assistant = useAssistant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const threads = useThreads();
  const usage = useQuery(aiUsageQuery);
  const thread = threads.data?.threads.find((item) => item.id === assistant.threadId);
  const percent =
    usage.data && usage.data.limit > 0
      ? Math.min(100, Math.round((usage.data.used / usage.data.limit) * 100))
      : null;

  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.ai.threads[":id"].$delete({ param: { id } })),
    onSuccess: async () => {
      assistant.newThread();
      await queryClient.invalidateQueries({ queryKey: chatThreadsQuery.queryKey });
      await navigate({ to: "/ai", search: {}, replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const heading = "text-foreground/60 m-0 text-[11px] font-bold tracking-[0.16em]";
  return (
    <aside
      aria-label={m.ai_rail_context()}
      className="hidden min-h-0 flex-col gap-5 overflow-y-auto rounded-3xl border border-white/8 bg-[#111217] p-4.5 lg:flex"
    >
      <section className="grid gap-2.5">
        <h2 className={heading}>{m.ai_rail_context()}</h2>
        {thread?.game?.id ? (
          <div className="flex items-center gap-2.5">
            <GameCover
              url={gameCoverUrl(
                { coverImageId: thread.game.coverImageId, coverUrl: thread.game.coverUrl },
                "cover_small",
              )}
              name={thread.game.name ?? ""}
              color={thread.game.accentColor}
              className="w-[26px] shrink-0 rounded-[5px]"
            />
            <span className="grid">
              <Link
                to="/g/$slug"
                params={{ slug: thread.game.slug ?? "" }}
                className="text-sm font-bold hover:underline"
              >
                {thread.game.name}
              </Link>
              <span className="text-foreground/62 text-xs">{m.ai_rail_context_game()}</span>
            </span>
          </div>
        ) : (
          <p className="text-foreground/70 m-0 text-[13px]">{m.ai_rail_context_empty()}</p>
        )}
      </section>
      <section className="grid gap-2.5">
        <h2 className={heading}>{m.ai_rail_quota()}</h2>
        {percent === null ? (
          <span className="text-[13px] font-bold">{m.ai_rail_quota_unlimited()}</span>
        ) : (
          <>
            <div className="flex justify-between gap-2 text-[13px]">
              <span className="font-bold">{m.ai_rail_quota_value({ percent })}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/8">
              <div className="h-1.5 rounded-full bg-[#cdd8ff]" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-foreground/62 text-xs">{m.ai_rail_quota_reset()}</span>
          </>
        )}
      </section>
      <section className="grid gap-2">
        <h2 className={heading}>{m.ai_rail_privacy()}</h2>
        <p className="text-foreground/74 m-0 text-[13px] leading-relaxed">{m.ai_privacy()}</p>
      </section>
      <span className="flex-1" />
      {thread && (
        <Button
          variant="ghost"
          className="text-destructive border-destructive/35 h-10 border"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(m.ai_delete_confirm())) remove.mutate(thread.id);
          }}
        >
          <Trash2Icon />
          {m.ai_delete_thread()}
        </Button>
      )}
    </aside>
  );
}

/**
 * My games AI'ın tam ekran görünümü (eski /chat'in yerine). Panelle aynı sohbet örneğini kullanır: panelden
 * genişletince akış kesilmez; "Panele küçült" önceki sayfaya dönüp paneli aynı sohbetle açar.
 */
function AssistantPage() {
  const { t } = Route.useSearch();
  const assistant = useAssistant();
  const router = useRouter();
  const threads = useThreads();

  // biome-ignore lint/correctness/useExhaustiveDependencies: yalnızca adresteki sohbet değişince
  useEffect(() => {
    if (t && t !== assistant.threadId) assistant.selectThread(t);
  }, [t]);

  if (!assistant.enabled) {
    return (
      <Alert className="mt-6">
        <AlertDescription>{m.ai_disabled()}</AlertDescription>
      </Alert>
    );
  }
  const title =
    threads.data?.threads.find((thread) => thread.id === assistant.threadId)?.title ??
    m.ai_new_chat();

  return (
    <div className="grid h-[calc(100dvh-13rem)] min-h-[520px] gap-4 pt-2 md:h-[calc(100dvh-8.5rem)] lg:grid-cols-[280px_minmax(0,1fr)_270px]">
      <Sidebar />
      <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/8 bg-[#0f1015]">
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-white/7 pr-3 pl-5">
          <h1 className="m-0 truncate text-base font-bold">{title}</h1>
          <Button
            variant="ghost"
            className="shrink-0"
            onClick={() => {
              assistant.setOpen(true);
              if (window.history.length > 1) router.history.back();
              else void router.navigate({ to: "/" });
            }}
          >
            <Minimize2Icon />
            {m.ai_collapse()}
          </Button>
        </header>
        <Conversation key={assistant.threadId} threadId={assistant.threadId} wide autoFocus />
      </section>
      <ContextRail />
    </div>
  );
}
