import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { Command } from "cmdk";
import { cn } from "cn";
import {
  ArrowRightIcon,
  BarChart3Icon,
  BellIcon,
  DicesIcon,
  GitCompareArrowsIcon,
  HistoryIcon,
  HouseIcon,
  InboxIcon,
  LanguagesIcon,
  LibraryIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MaximizeIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAddGame } from "@/components/add-game";
import { Pati } from "@/components/assistant/mascot";
import { useOptionalAssistant } from "@/components/assistant/provider";
import { GameCover } from "@/components/game-cover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api, unwrap } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatPlaytime, statusLabel } from "@/lib/format";
import { changeLocale, localeLabels } from "@/lib/locale";
import { avatarThumb } from "@/lib/media/urls";
import {
  libraryQuery,
  profileOverviewQuery,
  proposalCountQuery,
  unreadQuery,
  usersQuery,
} from "@/lib/queries";
import { type CurrentUser, useRefreshSession } from "@/lib/session";
import { m } from "@/paraglide/messages";
import { getLocale, locales } from "@/paraglide/runtime";

type SpotlightContext = { open: () => void };
const Context = createContext<SpotlightContext>({ open: () => {} });

/** Başlıktaki arama düğmesi ve telefondaki orta düğme Spotlight'ı buradan açar. */
export function useSpotlight() {
  return useContext(Context);
}

/**
 * ⌘K / Ctrl+K ile açılan komut paleti: sayfalara git, eylem çalıştır (oyun ekle, asistana sor, dil değiştir…),
 * kütüphanende, katalogda ve oyuncular arasında ara. Oturum yoksa kısayol da palet de yok.
 */
export function SpotlightProvider({ children }: { children: ReactNode }) {
  const { user } = useRouteContext({ from: "__root__" });
  const [open, setOpen] = useState(false);
  // İçerik ilk açılışta kurulur; hiç açılmayan ziyaretlerde sorgu atılmaz.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!user) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMounted(true);
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user]);

  const value = useMemo<SpotlightContext>(
    () => ({
      open: () => {
        setMounted(true);
        setOpen(true);
      },
    }),
    [],
  );

  return (
    <Context.Provider value={value}>
      {children}
      {user && mounted && <SpotlightDialog user={user} open={open} onOpenChange={setOpen} />}
    </Context.Provider>
  );
}

/** Türkçe/İngilizce fark etmeden eşleşsin: küçük harf, aksansız, ı→i. */
function normalize(text: string) {
  return text.toLocaleLowerCase("tr").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
}

type CommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** Aramada eşleşecek ek sözcükler (iki dilde de bulunabilsin). */
  keywords: string;
  icon: ReactNode;
  hint?: ReactNode;
  run: () => void;
};

function matches(item: CommandItem, words: string[]) {
  const haystack = normalize(`${item.title} ${item.subtitle ?? ""} ${item.keywords}`);
  return words.every((word) => haystack.includes(word));
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function SpotlightDialog(props: {
  user: CurrentUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, open, onOpenChange } = props;
  const username = user.displayUsername ?? user.username ?? "";
  const navigate = useNavigate();
  const addGame = useAddGame();
  const assistant = useOptionalAssistant();
  const refreshSession = useRefreshSession();
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const debounced = useDebounced(trimmed, 220);
  const searching = debounced.length >= 2;

  // Her açılışta boş başlar.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const overview = useQuery({ ...profileOverviewQuery(username), enabled: open && !!username });
  const inbox = useQuery({ ...proposalCountQuery, enabled: open });
  const unread = useQuery({ ...unreadQuery, enabled: open });
  const library = useQuery({
    ...libraryQuery(username, { q: debounced }),
    enabled: open && searching && !!username,
  });
  const catalog = useQuery({
    queryKey: ["catalog-search", debounced],
    queryFn: () => unwrap(api.catalog.search.$get({ query: { q: debounced } })),
    enabled: open && searching,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const people = useInfiniteQuery({
    ...usersQuery({ q: debounced }),
    enabled: open && searching,
  });

  // Yazarken eski sonuçlar kalır (placeholderData); yeni sorgu gelince yer değiştirir, liste zıplamaz.
  const results = {
    library: searching ? (library.data?.items.slice(0, 5) ?? []) : [],
    catalog: searching
      ? (catalog.data?.results.filter((result) => !result.inLibrary).slice(0, 5) ?? [])
      : [],
    people: searching ? (people.data?.pages[0]?.users.slice(0, 4) ?? []) : [],
  };
  const loading =
    trimmed !== debounced ||
    (searching && (library.isFetching || catalog.isFetching || people.isFetching));

  function close() {
    onOpenChange(false);
  }
  function go(to: string, params?: Record<string, string>) {
    close();
    void navigate({ to, params } as Parameters<typeof navigate>[0]);
  }

  const year = new Date().getFullYear();
  const otherLocale = locales.find((locale) => locale !== getLocale()) ?? locales[0];
  const inboxCount = inbox.data?.count ?? 0;
  const unreadCount = unread.data?.count ?? 0;

  const actions: CommandItem[] = [
    {
      id: "add-game",
      title: trimmed ? m.spotlight_add_named({ name: trimmed }) : m.action_add_game(),
      subtitle: m.spotlight_add_sub(),
      keywords: "add game new oyun ekle yeni",
      icon: <PlusIcon />,
      run: () => {
        close();
        addGame.open(undefined, { query: trimmed });
      },
    },
    ...(assistant?.enabled
      ? [
          {
            id: "ask-ai",
            title: trimmed ? m.spotlight_ask_ai_query({ query: trimmed }) : m.spotlight_ask_ai(),
            keywords: "pati ai assistant chat ask yapay zeka asistan sor sohbet",
            icon: <Pati size={20} still />,
            hint: <Kbd className="max-sm:hidden">⌘J</Kbd>,
            run: () => {
              close();
              if (trimmed) assistant.ask({ text: trimmed });
              else assistant.setOpen(true);
            },
          },
          {
            id: "pick",
            title: m.ai_pick_title(),
            keywords: "pick random suggest what to play öner seç rastgele",
            icon: <DicesIcon />,
            run: () => {
              close();
              assistant.openPick();
            },
          },
        ]
      : []),
  ];

  const pages: CommandItem[] = [
    { id: "home", title: m.nav_home(), keywords: "home feed ana sayfa akış", icon: <HouseIcon /> },
    {
      id: "profile",
      title: m.nav_profile(),
      subtitle: `@${username}`,
      keywords: "profile me profil ben",
      icon: <UserRoundIcon />,
    },
    {
      id: "library",
      title: m.nav_library(),
      keywords: "library games collection kütüphane oyunlar",
      icon: <LibraryIcon />,
    },
    {
      id: "users",
      title: m.nav_users(),
      keywords: "players users people community oyuncular kullanıcılar topluluk",
      icon: <UsersIcon />,
    },
    {
      id: "stats",
      title: m.nav_stats(),
      keywords: "stats statistics istatistik",
      icon: <BarChart3Icon />,
    },
    {
      id: "inbox",
      title: m.nav_inbox(),
      keywords: "inbox proposals sync steam onay kutusu öneriler",
      icon: <InboxIcon />,
      hint: inboxCount > 0 ? <Count value={inboxCount} /> : undefined,
    },
    {
      id: "notifications",
      title: m.nav_notifications(),
      keywords: "notifications bildirimler",
      icon: <BellIcon />,
      hint: unreadCount > 0 ? <Count value={unreadCount} /> : undefined,
    },
    {
      id: "history",
      title: m.nav_history(),
      keywords: "history undo geçmiş geri al",
      icon: <HistoryIcon />,
    },
    {
      id: "wrapped",
      title: m.wrapped_title({ year: String(year) }),
      keywords: "wrapped year review yıl özet",
      icon: <SparklesIcon />,
    },
    {
      id: "compare",
      title: m.compare_title(),
      keywords: "compare karşılaştır",
      icon: <GitCompareArrowsIcon />,
    },
    ...(assistant?.enabled
      ? [
          {
            id: "ai",
            title: m.nav_ai_full(),
            keywords: "ai full screen assistant tam ekran asistan",
            icon: <MaximizeIcon />,
          },
        ]
      : []),
    {
      id: "settings",
      title: m.nav_settings(),
      keywords: "settings preferences account profile steam xbox ayarlar tercihler hesap",
      icon: <SettingsIcon />,
    },
    ...(user.role === "admin"
      ? [
          {
            id: "admin",
            title: m.nav_admin(),
            keywords: "admin moderation yönetim moderasyon",
            icon: <ShieldIcon />,
          },
        ]
      : []),
  ].map((item) => ({ ...item, run: () => openPage(item.id) }));

  function openPage(id: string) {
    switch (id) {
      case "home":
        return go("/");
      case "profile":
        return go("/u/$username", { username });
      case "library":
        return go("/u/$username/library", { username });
      case "users":
        return go("/users");
      case "stats":
        return go("/stats");
      case "inbox":
        return go("/inbox");
      case "notifications":
        return go("/notifications");
      case "history":
        return go("/history");
      case "wrapped":
        return go("/u/$username/wrapped/$year", { username, year: String(year) });
      case "compare":
        return go("/compare");
      case "ai":
        return go("/ai");
      case "settings":
        return go("/settings");
      case "admin":
        return go("/admin");
    }
  }

  const preferences: CommandItem[] = [
    {
      id: "language",
      title: m.spotlight_language({ language: localeLabels[otherLocale] }),
      keywords: "language dil english türkçe turkish ingilizce",
      icon: <LanguagesIcon />,
      run: () => {
        close();
        changeLocale(otherLocale, { signedIn: true }).catch((error: unknown) =>
          toast.error(error instanceof Error ? error.message : m.error_generic()),
        );
      },
    },
    {
      id: "sign-out",
      title: m.nav_sign_out(),
      keywords: "sign out log out çıkış",
      icon: <LogOutIcon />,
      run: () => {
        close();
        void authClient
          .signOut()
          .then(() => refreshSession())
          .then(() => navigate({ to: "/" }));
      },
    },
  ];

  const words = normalize(trimmed).split(/\s+/).filter(Boolean);
  const filter = (items: CommandItem[]) =>
    words.length ? items.filter((item) => matches(item, words)) : items;
  // Yazılınca oyun ekleme ve asistana sorma her zaman görünür (sorgu onların girdisi olur).
  const shownActions = trimmed
    ? actions.filter((item) => item.id !== "pick" || matches(item, words))
    : actions;
  const shownPages = filter(pages);
  const shownPreferences = filter(preferences);
  const playing = trimmed ? [] : (overview.data?.nowPlaying.slice(0, 4) ?? []);

  // Seçili satır, sonuçlar değişince (arama gecikmeli gelir) listenin başına döner; kullanıcı oklarla
  // gezinirken ilk satır değişmediği için dokunulmaz.
  const first = trimmed
    ? results.library[0]
      ? `entry-${results.library[0].id}`
      : (shownPages[0]?.id ?? shownActions[0]?.id)
    : playing[0]
      ? `playing-${playing[0].id}`
      : shownActions[0]?.id;
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (first) setSelected(first);
  }, [first]);
  const nothing =
    searching &&
    !loading &&
    !shownPages.length &&
    !shownPreferences.length &&
    !results.library.length &&
    !results.catalog.length &&
    !results.people.length;

  const actionsGroup = shownActions.length > 0 && (
    <Group heading={m.spotlight_group_actions()}>
      {shownActions.map((item) => (
        <CommandRow key={item.id} item={item} />
      ))}
    </Group>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[state=open]:slide-in-from-top-2 fixed top-3 left-1/2 z-50 w-[calc(100vw-24px)] max-w-[680px] -translate-x-1/2 overflow-hidden rounded-[26px] border border-white/12 bg-[rgb(20_21_27/0.94)] shadow-[0_40px_120px_-30px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-2xl duration-200 outline-none sm:top-[12vh]"
        >
          <DialogPrimitive.Title className="sr-only">{m.spotlight_title()}</DialogPrimitive.Title>
          <Command
            shouldFilter={false}
            loop
            value={selected}
            onValueChange={setSelected}
            label={m.spotlight_title()}
            className="flex flex-col"
          >
            <div className="flex items-center gap-3 border-b border-white/8 px-5">
              {loading ? (
                <LoaderCircleIcon className="text-foreground/55 size-5 shrink-0 animate-spin" />
              ) : (
                <SearchIcon className="text-foreground/55 size-5 shrink-0" />
              )}
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={m.spotlight_placeholder()}
                className="placeholder:text-foreground/35 h-16 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-[17px]"
              />
              <Kbd className="hidden sm:inline-flex">esc</Kbd>
            </div>

            <Command.List className="max-h-[min(62dvh,540px)] scroll-py-2 overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin]">
              {nothing && (
                <div className="grid justify-items-center gap-1.5 px-6 py-12 text-center">
                  <p className="font-semibold">{m.spotlight_empty({ query: trimmed })}</p>
                  <p className="text-foreground/55 text-sm">{m.spotlight_empty_hint()}</p>
                </div>
              )}

              {playing.length > 0 && (
                <Group heading={m.spotlight_group_playing()}>
                  {playing.map((item) => (
                    <Item
                      key={item.id}
                      value={`playing-${item.id}`}
                      onSelect={() => go("/e/$id", { id: item.id })}
                      media={<Cover url={item.game.coverUrl} name={item.game.name} />}
                      title={item.game.name}
                      subtitle={item.playtimeMin > 0 ? formatPlaytime(item.playtimeMin) : undefined}
                    />
                  ))}
                </Group>
              )}

              {/* Boş aramada eylemler en üstte; yazınca önce kütüphanedeki ve sayfa eşleşmeleri gelir ki Enter
                  var olan kayda gitsin, "ekle"ye değil. */}
              {!trimmed && actionsGroup}

              {results.library.length > 0 && (
                <Group heading={m.spotlight_group_library()}>
                  {results.library.map((item) => (
                    <Item
                      key={item.id}
                      value={`entry-${item.id}`}
                      onSelect={() => go("/e/$id", { id: item.id })}
                      media={<Cover url={item.game.coverUrl} name={item.game.name} />}
                      title={item.game.name}
                      subtitle={[
                        statusLabel(item.status),
                        item.playtimeMin > 0 ? formatPlaytime(item.playtimeMin) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ))}
                </Group>
              )}

              {shownPages.length > 0 && (
                <Group heading={m.spotlight_group_navigation()}>
                  {shownPages.map((item) => (
                    <CommandRow key={item.id} item={item} />
                  ))}
                </Group>
              )}

              {trimmed && actionsGroup}

              {results.catalog.length > 0 && (
                <Group heading={m.spotlight_group_games()}>
                  {results.catalog.map((result) => (
                    <Item
                      key={result.gameId ?? `igdb-${result.igdbId}`}
                      value={`catalog-${result.gameId ?? result.igdbId}`}
                      onSelect={() => {
                        close();
                        addGame.open(
                          result.gameId
                            ? {
                                kind: "game",
                                gameId: result.gameId,
                                name: result.name,
                                coverUrl: result.coverUrl,
                                releaseYear: result.releaseYear,
                              }
                            : {
                                kind: "igdb",
                                igdbId: result.igdbId ?? 0,
                                name: result.name,
                                coverUrl: result.coverUrl,
                                releaseYear: result.releaseYear,
                              },
                        );
                      }}
                      media={<Cover url={result.coverUrl} name={result.name} />}
                      title={result.name}
                      subtitle={result.releaseYear ? String(result.releaseYear) : undefined}
                      hint={
                        <span className="flex items-center gap-1.5">
                          {result.slug && (
                            <button
                              type="button"
                              className="text-foreground/60 hover:text-foreground rounded-full px-2 py-1 text-xs font-semibold hover:bg-white/10"
                              onClick={(event) => {
                                event.stopPropagation();
                                go("/g/$slug", { slug: result.slug ?? "" });
                              }}
                            >
                              {m.spotlight_game_page()}
                            </button>
                          )}
                          <span className="bg-foreground/10 text-foreground/80 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold">
                            <PlusIcon className="size-3.5" />
                            {m.spotlight_hint_add()}
                          </span>
                        </span>
                      }
                    />
                  ))}
                </Group>
              )}

              {results.people.length > 0 && (
                <Group heading={m.spotlight_group_people()}>
                  {results.people.map((person) => (
                    <Item
                      key={person.id}
                      value={`user-${person.id}`}
                      onSelect={() => go("/u/$username", { username: person.username })}
                      media={
                        <Avatar className="size-9">
                          {person.image && <AvatarImage src={avatarThumb(person.image)} alt="" />}
                          <AvatarFallback>{person.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                      }
                      title={person.name}
                      subtitle={`@${person.username}${
                        person.nowPlaying ? ` · ${person.nowPlaying.name}` : ""
                      }`}
                      hint={
                        person.id === user.id ? (
                          <span className="text-foreground/50 text-xs font-semibold">
                            {m.spotlight_you()}
                          </span>
                        ) : undefined
                      }
                    />
                  ))}
                </Group>
              )}

              {shownPreferences.length > 0 && (
                <Group heading={m.spotlight_group_preferences()}>
                  {shownPreferences.map((item) => (
                    <CommandRow key={item.id} item={item} />
                  ))}
                </Group>
              )}
            </Command.List>

            <footer className="text-foreground/50 hidden items-center gap-5 border-t border-white/8 px-5 py-3 text-xs sm:flex">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                {m.spotlight_hint_navigate()}
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd>
                {m.spotlight_hint_select()}
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>esc</Kbd>
                {m.spotlight_hint_close()}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </footer>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:text-foreground/45 pb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:uppercase"
    >
      {children}
    </Command.Group>
  );
}

function CommandRow({ item }: { item: CommandItem }) {
  return (
    <Item
      value={item.id}
      onSelect={item.run}
      media={
        <span className="group-data-[selected=true]:text-foreground flex size-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.05] text-foreground/75 transition-colors group-data-[selected=true]:border-white/14 group-data-[selected=true]:bg-white/12 [&_svg]:size-[18px]">
          {item.icon}
        </span>
      }
      title={item.title}
      subtitle={item.subtitle}
      hint={item.hint}
    />
  );
}

function Item(props: {
  value: string;
  onSelect: () => void;
  media: ReactNode;
  title: string;
  subtitle?: string;
  hint?: ReactNode;
}) {
  return (
    <Command.Item
      value={props.value}
      onSelect={props.onSelect}
      className="group flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition-colors duration-150 outline-none select-none data-[selected=true]:bg-white/[0.07]"
    >
      <span className="flex w-9 shrink-0 justify-center">{props.media}</span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-[15px] font-semibold">{props.title}</span>
        {props.subtitle && (
          <span className="text-foreground/55 truncate text-[13px]">{props.subtitle}</span>
        )}
      </span>
      {props.hint}
      <ArrowRightIcon className="text-foreground/0 group-data-[selected=true]:text-foreground/55 size-4 shrink-0 transition-colors max-sm:hidden" />
    </Command.Item>
  );
}

function Cover({ url, name }: { url: string | null; name: string }) {
  return <GameCover url={url} name={name} className="w-8 rounded-md" />;
}

function Count({ value }: { value: number }) {
  return (
    <span className="bg-foreground text-background flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold">
      {value > 99 ? "99+" : value}
    </span>
  );
}

function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "text-foreground/60 inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-1.5 font-sans text-[11px] font-semibold",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
