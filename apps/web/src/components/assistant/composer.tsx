import { entryStatuses } from "@my-games/shared";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import {
  ArrowUpIcon,
  AtSignIcon,
  EyeIcon,
  HashIcon,
  PencilIcon,
  SlashIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { GameCover } from "@/components/game-cover";
import { CoachMark } from "@/components/onboarding/coach-mark";
import {
  type AssistantCommand,
  COMMANDS,
  type Mention,
  mentionsQuery,
  suggestionsQuery,
} from "@/lib/assistant";
import { formatRating, statusLabel } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { Paddie } from "./mascot";
import { setTyping } from "./mascot-store";
import { useAssistant } from "./provider";

type MenuItem =
  | {
      kind: "mention";
      key: string;
      mention: Mention;
      title: string;
      sub: string;
      cover?: string | null;
      color?: string | null;
      avatar?: string;
    }
  | {
      kind: "command";
      key: string;
      command: AssistantCommand;
      title: string;
      sub: string;
      act?: boolean;
    };

type QuickItem =
  | { kind: "ask"; key: string }
  | {
      kind: "game";
      key: string;
      entryId: string;
      title: string;
      sub: string;
      cover: string | null;
      color: string | null;
    }
  | { kind: "person"; key: string; username: string; title: string; sub: string };

const AT = /(^|\s)@([^\s@]*)$/;
const SLASH = /^\/(\S*)$/;

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function MenuRow({
  active,
  onPick,
  children,
}: {
  active: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // Seçim sırasında metin kutusu odağı kaybetmesin.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors",
        active ? "bg-white/9" : "hover:bg-white/6",
      )}
    >
      {children}
    </button>
  );
}

const sectionLabel = "text-foreground/60 px-2.5 pt-2 pb-1 text-[11px] font-bold tracking-[0.16em]";

/**
 * Mesaj kutusu. Tek kutu hem arar hem sorar: boş sohbette yazarken kütüphanedeki eşleşmeler görünür,
 * Enter asistana gönderir. `@` etiket menüsünü, baştaki `/` komut menüsünü açar; seçilenler kutunun üstünde
 * çip olur ve mesajla birlikte (kimlikleriyle) gider.
 */
export function Composer({
  threadId,
  busy,
  hasMessages,
  onSend,
  onStop,
  autoFocus,
}: {
  threadId: string;
  busy: boolean;
  hasMessages: boolean;
  onSend: (input: {
    text: string;
    mentions: Mention[];
    command?: AssistantCommand;
    withoutPage: boolean;
  }) => void;
  onStop: () => void;
  autoFocus?: boolean;
}) {
  const assistant = useAssistant();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [command, setCommand] = useState<AssistantCommand | undefined>();
  const [withoutPage, setWithoutPage] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const act = assistant.mode === "act";

  // Sohbet değişince kutu temizlenir.
  // biome-ignore lint/correctness/useExhaustiveDependencies: yalnızca sohbet kimliği değişince
  useEffect(() => {
    setText("");
    setMentions([]);
    setCommand(undefined);
    setWithoutPage(false);
  }, [threadId]);

  // Kutuda yazı varken Paddie mesaj kutusuna bakar (dinler).
  const typing = text.trim().length > 0;
  useEffect(() => setTyping(typing), [typing]);
  useEffect(() => () => setTyping(false), []);

  const suggestions = useQuery({ ...suggestionsQuery(assistant.page), enabled: assistant.enabled });
  const pageLabel =
    assistant.page?.type === "game" || assistant.page?.type === "entry"
      ? (suggestions.data?.pageGame?.name ?? null)
      : assistant.page?.type === "profile"
        ? `@${assistant.page.username}`
        : null;

  const atMatch = text.match(AT);
  const slashMatch = !atMatch ? text.match(SLASH) : null;
  const menu: "at" | "slash" | null = dismissed
    ? null
    : atMatch
      ? "at"
      : slashMatch
        ? "slash"
        : null;
  const query = atMatch?.[2] ?? "";
  const quickText = !menu && !hasMessages && text.trim().length >= 2 ? text.trim() : "";
  const lookup = useDebounced(menu === "at" ? query : quickText, 150);
  const candidates = useQuery({
    ...mentionsQuery(lookup),
    enabled: assistant.enabled && (menu === "at" || !!quickText),
    placeholderData: (previous) => previous,
  });

  const menuItems = useMemo<MenuItem[]>(() => {
    if (menu === "slash") {
      const q = `/${slashMatch?.[1] ?? ""}`.toLocaleLowerCase();
      return COMMANDS.filter(
        (item) => item.name().toLocaleLowerCase().startsWith(q) || `/${item.id}`.startsWith(q),
      ).map((item) => ({
        kind: "command",
        key: item.id,
        command: item.id,
        title: item.name(),
        sub: item.description(),
        act: item.act,
      }));
    }
    if (menu !== "at") return [];
    const q = query.toLocaleLowerCase();
    const games: MenuItem[] = (candidates.data?.games ?? []).map((game) => ({
      kind: "mention",
      key: `game-${game.gameId}`,
      mention: { type: "game", gameId: game.gameId, label: game.name },
      title: game.name,
      sub: [statusLabel(game.status), game.rating !== null ? formatRating(game.rating * 10) : null]
        .filter(Boolean)
        .join(" · "),
      cover: game.coverUrl,
      color: game.accentColor,
    }));
    const people: MenuItem[] = (candidates.data?.people ?? []).map((person) => ({
      kind: "mention",
      key: `user-${person.username}`,
      mention: { type: "user", username: person.username, label: person.name },
      title: person.name,
      sub: `@${person.username} · ${m.ai_mention_person_sub({ count: person.games })}`,
      avatar: person.name.slice(0, 1).toUpperCase(),
    }));
    const year = new Date().getFullYear();
    const other: MenuItem[] = [
      ...entryStatuses
        .filter((status) => !q || statusLabel(status).toLocaleLowerCase().includes(q))
        .map((status) => ({
          kind: "mention" as const,
          key: `status-${status}`,
          mention: { type: "status" as const, status, label: statusLabel(status) },
          title: statusLabel(status),
          sub: m.ai_mention_status_sub(),
        })),
      ...[year, year - 1, year - 2]
        .filter((value) => !q || String(value).startsWith(q))
        .map((value) => ({
          kind: "mention" as const,
          key: `year-${value}`,
          mention: { type: "year" as const, year: value, label: String(value) },
          title: m.ai_mention_year({ year: String(value) }),
          sub: m.ai_mention_year_sub(),
        })),
    ].slice(0, q ? 4 : 3);
    return [...games, ...people, ...other];
  }, [menu, slashMatch, query, candidates.data]);

  const quickItems = useMemo<QuickItem[]>(() => {
    if (!quickText) return [];
    const q = quickText.toLocaleLowerCase();
    const games = (candidates.data?.games ?? [])
      .filter((game) => game.name.toLocaleLowerCase().includes(q))
      .slice(0, 4);
    const people = (candidates.data?.people ?? []).slice(0, 2);
    return [
      { kind: "ask", key: "ask" },
      ...games.map((game) => ({
        kind: "game" as const,
        key: game.entryId,
        entryId: game.entryId,
        title: game.name,
        sub: statusLabel(game.status),
        cover: game.coverUrl,
        color: game.accentColor,
      })),
      ...people.map((person) => ({
        kind: "person" as const,
        key: person.username,
        username: person.username,
        title: person.name,
        sub: `@${person.username}`,
      })),
    ];
  }, [quickText, candidates.data]);

  const items = menu ? menuItems : quickItems.length > 1 ? quickItems : [];
  // biome-ignore lint/correctness/useExhaustiveDependencies: liste değişince seçim başa döner
  useEffect(() => setActive(0), [menu, query, quickText]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: yazmaya devam edince kapatılan menü yeniden açılabilsin
  useEffect(() => setDismissed(false), [text]);

  function pickMention(mention: Mention) {
    setMentions((previous) =>
      previous.some((item) => JSON.stringify(item) === JSON.stringify(mention))
        ? previous
        : [...previous, mention],
    );
    setText((previous) => previous.replace(AT, "$1"));
    input.current?.focus();
  }

  function pickCommand(value: AssistantCommand) {
    setText("");
    if (value === "pick") {
      assistant.openPick();
      return;
    }
    if (value === "review" && assistant.page?.type === "entry") {
      assistant.openInterview(assistant.page.id);
      return;
    }
    if (COMMANDS.find((item) => item.id === value)?.act) assistant.setMode("act");
    setCommand(value);
    input.current?.focus();
  }

  function choose(item: MenuItem | QuickItem) {
    if (item.kind === "mention") pickMention(item.mention);
    else if (item.kind === "command") pickCommand(item.command);
    else if (item.kind === "ask") send();
    else if (item.kind === "game") void navigate({ to: "/e/$id", params: { id: item.entryId } });
    else if (item.kind === "person")
      void navigate({ to: "/u/$username", params: { username: item.username } });
  }

  function send() {
    const value = text.trim();
    if (!value || busy) return;
    onSend({ text: value, mentions, command, withoutPage: withoutPage || !pageLabel });
    setText("");
    setMentions([]);
    setCommand(undefined);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (items.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setActive(
        (index) => (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length,
      );
      return;
    }
    if (event.key === "Escape" && (menu || items.length)) {
      event.preventDefault();
      setDismissed(true);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const item = items[active];
      if (menu && item) choose(item);
      else send();
      return;
    }
    if (event.key === "Backspace" && !text && (mentions.length || command)) {
      if (command) setCommand(undefined);
      else setMentions((previous) => previous.slice(0, -1));
    }
  }

  // Metin kutusu içeriğe göre büyür (en fazla ~6 satır).
  // biome-ignore lint/correctness/useExhaustiveDependencies: metin değişince ölç
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [text]);

  const chips = [
    ...(pageLabel && !withoutPage
      ? [{ key: "page", label: pageLabel, page: true, onRemove: () => setWithoutPage(true) }]
      : []),
    ...mentions.map((mention, index) => ({
      key: `${mention.type}-${mention.label}-${index}`,
      label: mention.label,
      mention,
      page: false,
      onRemove: () =>
        setMentions((previous) => previous.filter((_, position) => position !== index)),
    })),
  ];
  const commandInfo = COMMANDS.find((item) => item.id === command);

  return (
    <div className="relative">
      {items.length > 0 && (
        <div className="animate-pop absolute inset-x-0 bottom-[calc(100%+10px)] z-20 max-h-[min(470px,55dvh)] overflow-y-auto rounded-[18px] border border-white/12 bg-[#1b1c23] p-2 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] [scrollbar-width:none]">
          {menu === "slash" && <div className={sectionLabel}>{m.ai_menu_commands()}</div>}
          {items.map((item, index) => {
            const previous = items[index - 1];
            const header =
              menu === "at" && item.kind === "mention"
                ? item.mention.type === "game" && previous?.kind !== "mention"
                  ? m.ai_menu_library()
                  : item.mention.type === "user" &&
                      (previous?.kind !== "mention" || previous.mention.type !== "user")
                    ? m.ai_menu_people()
                    : (item.mention.type === "status" || item.mention.type === "year") &&
                        (previous?.kind !== "mention" ||
                          previous.mention.type === "game" ||
                          previous.mention.type === "user")
                      ? m.ai_menu_other()
                      : null
                : !menu && item.kind === "game" && previous?.kind === "ask"
                  ? m.ai_quick_library()
                  : !menu && item.kind === "person" && previous?.kind !== "person"
                    ? m.ai_quick_people()
                    : null;
            return (
              <div key={item.key}>
                {header && <div className={sectionLabel}>{header}</div>}
                <MenuRow active={index === active} onPick={() => choose(item)}>
                  {item.kind === "ask" ? (
                    <>
                      <Paddie size={30} still />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="text-sm font-bold">{m.ai_quick_ask()}</span>
                        <span className="text-foreground/72 truncate text-xs">“{quickText}”</span>
                      </span>
                    </>
                  ) : item.kind === "command" ? (
                    <>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="font-mono text-[13px] font-bold">{item.title}</span>
                        <span className="text-foreground/66 truncate text-xs">{item.sub}</span>
                      </span>
                      {item.act && (
                        <span className="rounded-full bg-[#f2c77a]/16 px-2 py-0.5 text-[11px] font-bold text-[#f2c77a]">
                          {m.ai_mode_act()}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {"cover" in item && item.cover !== undefined ? (
                        <GameCover
                          url={item.cover}
                          name={item.title}
                          color={item.color}
                          className="w-7 shrink-0 rounded-[5px]"
                        />
                      ) : "avatar" in item && item.avatar ? (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#c2552d] text-[13px] font-bold">
                          {item.avatar}
                        </span>
                      ) : item.kind === "person" ? (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#c2552d] text-[13px] font-bold">
                          {item.title.slice(0, 1).toUpperCase()}
                        </span>
                      ) : (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/8">
                          <HashIcon className="size-4" />
                        </span>
                      )}
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate text-sm font-bold">{item.title}</span>
                        <span className="text-foreground/66 truncate text-xs">{item.sub}</span>
                      </span>
                    </>
                  )}
                </MenuRow>
              </div>
            );
          })}
          {menu && items.length === 0 && (
            <p className="text-foreground/66 p-2.5 text-sm">{m.ai_menu_empty()}</p>
          )}
        </div>
      )}

      <div
        className={cn(
          "grid gap-2 rounded-[20px] border bg-[#16171d] p-2.5 transition-[border-color,box-shadow]",
          act
            ? "border-[#f2c77a]/70 shadow-[0_0_0_4px_rgb(242_199_122/10%)]"
            : "border-[#9fb4ff]/50 shadow-[0_0_0_4px_rgb(159_180_255/8%)]",
        )}
      >
        {(chips.length > 0 || commandInfo) && (
          <div className="flex flex-wrap gap-1.5">
            {commandInfo && (
              <span className="inline-flex h-[30px] items-center gap-1 rounded-full border border-white/10 bg-white/8 pr-1 pl-2.5 font-mono text-[13px] font-bold text-[#f2c77a]">
                {commandInfo.name()}
                <button
                  type="button"
                  aria-label={m.ai_remove_tag({ label: commandInfo.name() })}
                  onClick={() => setCommand(undefined)}
                  className="text-foreground/70 flex size-[22px] items-center justify-center rounded-full hover:bg-white/10"
                >
                  <XIcon className="size-3" strokeWidth={3} />
                </button>
              </span>
            )}
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-white/10 bg-white/8 pr-1 pl-2.5 text-[13px] font-bold"
              >
                {"mention" in chip && chip.mention?.type === "user" ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-[#c2552d] text-[10px]">
                    {chip.label.slice(0, 1).toUpperCase()}
                  </span>
                ) : (
                  <HashIcon className="size-3.5 opacity-70" />
                )}
                <span className="max-w-40 truncate">
                  {"mention" in chip && chip.mention?.type === "status"
                    ? statusLabel(chip.mention.status)
                    : chip.label}
                </span>
                {chip.page && (
                  <span className="text-foreground/60 font-semibold">{m.ai_this_page()}</span>
                )}
                <button
                  type="button"
                  aria-label={m.ai_remove_tag({ label: chip.label })}
                  onClick={chip.onRemove}
                  className="text-foreground/70 flex size-[22px] items-center justify-center rounded-full hover:bg-white/10"
                >
                  <XIcon className="size-3" strokeWidth={3} />
                </button>
              </span>
            ))}
          </div>
        )}

        <label className="block">
          <span className="sr-only">{m.ai_placeholder()}</span>
          <textarea
            ref={input}
            // biome-ignore lint/a11y/noAutofocus: panel açılınca yazmaya hazır olsun
            autoFocus={autoFocus}
            rows={1}
            value={text}
            maxLength={4000}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={hasMessages ? m.ai_placeholder_followup() : m.ai_placeholder()}
            className="placeholder:text-foreground/55 block max-h-40 min-h-9 w-full resize-none bg-transparent px-1.5 py-1.5 text-[15px] outline-none"
          />
        </label>

        <div className="flex items-center gap-1.5">
          <CoachMark tip="ai_modes" anchor="ai-modes" side="top" align="start" />
          <fieldset
            data-tour="ai-modes"
            className="m-0 flex gap-0.5 rounded-xl border-0 bg-white/6 p-[3px]"
          >
            <legend className="sr-only">{m.ai_mode_label()}</legend>
            <button
              type="button"
              aria-pressed={!act}
              onClick={() => assistant.setMode("ask")}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-bold transition-colors",
                !act ? "bg-[#cdd8ff] text-[#0b0c10]" : "text-foreground/78 hover:text-foreground",
              )}
            >
              <EyeIcon className="size-3.5" />
              {m.ai_mode_ask()}
            </button>
            <button
              type="button"
              aria-pressed={act}
              onClick={() => assistant.setMode("act")}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-bold transition-colors",
                act ? "bg-[#f2c77a] text-[#0b0c10]" : "text-foreground/78 hover:text-foreground",
              )}
            >
              <PencilIcon className="size-3.5" />
              {m.ai_mode_act()}
            </button>
          </fieldset>
          <span className="flex-1" />
          <button
            type="button"
            aria-label={m.ai_tag()}
            aria-expanded={menu === "at"}
            onClick={() => {
              setText((previous) =>
                AT.test(previous)
                  ? previous.replace(AT, "$1")
                  : `${previous}${previous && !previous.endsWith(" ") ? " " : ""}@`,
              );
              input.current?.focus();
            }}
            className={cn(
              "flex size-9 items-center justify-center rounded-[10px] hover:bg-white/10",
              menu === "at" && "bg-white/12",
            )}
          >
            <AtSignIcon className="size-[17px]" />
          </button>
          <button
            type="button"
            aria-label={m.ai_commands()}
            aria-expanded={menu === "slash"}
            onClick={() => {
              setText((previous) => (SLASH.test(previous) ? "" : previous ? previous : "/"));
              input.current?.focus();
            }}
            className={cn(
              "flex size-9 items-center justify-center rounded-[10px] hover:bg-white/10",
              menu === "slash" && "bg-white/12",
            )}
          >
            <SlashIcon className="size-[17px]" />
          </button>
          {busy ? (
            <button
              type="button"
              aria-label={m.ai_stop()}
              onClick={onStop}
              className="flex size-9 items-center justify-center rounded-full border border-white/20 hover:bg-white/10"
            >
              <SquareIcon className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={m.ai_send()}
              disabled={!text.trim()}
              onClick={send}
              className="bg-foreground text-background flex size-9 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
            >
              <ArrowUpIcon className="size-[18px]" strokeWidth={2.6} />
            </button>
          )}
        </div>
      </div>
      <p className="text-foreground/62 mt-2 px-2 text-xs">
        {act ? m.ai_mode_act_hint() : m.ai_mode_ask_hint()}
      </p>
    </div>
  );
}
