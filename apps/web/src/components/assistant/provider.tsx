import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useRouterState } from "@tanstack/react-router";
import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type AssistantCommand,
  type AssistantMode,
  type Mention,
  type PageContext,
  pageContextOf,
} from "@/lib/assistant";
import { metaQuery } from "@/lib/meta";
import { uuid } from "@/lib/uuid";

const PickDialog = lazy(() =>
  import("./pick-dialog").then((module) => ({ default: module.PickDialog })),
);
const InterviewDialog = lazy(() =>
  import("./interview-dialog").then((module) => ({ default: module.InterviewDialog })),
);

export type AskInput = {
  text: string;
  mentions?: Mention[];
  command?: AssistantCommand;
  mode?: AssistantMode;
  /** Sayfa bağlamı gönderilmesin (kullanıcı bağlam etiketini kaldırdı). */
  withoutPage?: boolean;
  /** Açık sohbette mesaj varsa yeni bir sohbet başlatılır. */
  fresh?: boolean;
};

type AssistantContextValue = {
  enabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Tam ekran görünüm (/ai) açık: panel gösterilmez. */
  onPage: boolean;
  threadId: string;
  selectThread: (id: string) => void;
  newThread: () => void;
  mode: AssistantMode;
  setMode: (mode: AssistantMode) => void;
  page: PageContext | undefined;
  /** Sohbette ilk mesaj gönderildi (sunucuda var sayılır). */
  markKnown: (threadId: string) => void;
  /** Sunucuda var olan (en az bir mesajı gönderilmiş) sohbetler; geçmiş yalnızca bunlar için yüklenir. */
  isKnownThread: (threadId: string) => boolean;
  ask: (input: AskInput) => void;
  openPick: () => void;
  openInterview: (entryId: string) => void;
};

const Context = createContext<AssistantContextValue | null>(null);

export function useAssistant() {
  const value = useContext(Context);
  if (!value) throw new Error("AssistantProvider eksik");
  return value;
}

/** Sağlayıcı dışında (oturum yok) güvenli kullanım. */
export function useOptionalAssistant() {
  return useContext(Context);
}

const STORAGE = { open: "mg.ai.open", thread: "mg.ai.thread", mode: "mg.ai.mode" } as const;

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Gizli sekme vb.: tercih hatırlanmaz, sorun değil.
  }
}

/**
 * Medya sorgusu. Tarayıcıda ilk çizimden itibaren gerçek değeri verir (sunucuda ve hydration'da `false`).
 * Önceden ilk kare hep `false` idi: geniş ekranda sabit panel bir anlığına modal Sheet olarak açılıyor, sayfayı
 * kilitleyip karartıyordu.
 */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { user } = useRouteContext({ from: "__root__" });
  const meta = useQuery(metaQuery);
  const enabled = !!user && !!meta.data?.features.ai;
  const queryClient = useQueryClient();
  const matches = useRouterState({
    select: (state) =>
      state.matches.map((match) => ({
        routeId: match.routeId,
        params: match.params as Record<string, string>,
      })),
    // Seçici her seferinde yeni dizi döner; içerik aynıysa önceki referans kalsın, bütün asistan tüketicileri
    // her yönlendirici güncellemesinde yeniden çizilmesin.
    structuralSharing: true,
  });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const page = useMemo(() => pageContextOf(matches), [matches]);
  const onPage = matches.some((match) => match.routeId === "/_authed/ai");

  const [open, setOpenState] = useState(false);
  const [threadId, setThreadId] = useState(() => uuid());
  const [mode, setModeState] = useState<AssistantMode>("ask");
  const [pickOpen, setPickOpen] = useState(false);
  const [interview, setInterview] = useState<string | null>(null);
  const known = useRef(new Set<string>());

  // Tercihler tarayıcıda hatırlanır (sunucuda değil): açık panel, son sohbet, mod.
  useEffect(() => {
    const storedThread = read(STORAGE.thread);
    if (storedThread) {
      known.current.add(storedThread);
      setThreadId(storedThread);
    }
    if (read(STORAGE.mode) === "act") setModeState("act");
    if (read(STORAGE.open) === "1" && window.matchMedia("(min-width: 1280px)").matches)
      setOpenState(true);
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    write(STORAGE.open, next ? "1" : null);
  }, []);
  const setMode = useCallback((next: AssistantMode) => {
    setModeState(next);
    write(STORAGE.mode, next === "act" ? "act" : null);
  }, []);

  const selectThread = useCallback((id: string) => {
    known.current.add(id);
    setThreadId(id);
    write(STORAGE.thread, id);
  }, []);

  const newThread = useCallback(() => {
    const id = uuid();
    setThreadId(id);
    write(STORAGE.thread, null);
  }, []);

  // Karşılama kartları ve sayfa kartları sohbeti buradan başlatır. AI SDK ve sohbet deposu yalnızca bu an
  // (ya da panel ilk açıldığında) yüklenir.
  const ask = useCallback(
    (input: AskInput) => {
      setOpen(true);
      void import("./chat-store").then(({ chatState, getChat }) => {
        let id = threadId;
        const state = chatState(id);
        if ((input.fresh && state.hasMessages) || state.busy) {
          id = uuid();
          setThreadId(id);
        }
        write(STORAGE.thread, id);
        known.current.add(id);
        void getChat(id, queryClient).sendMessage({
          text: input.text,
          metadata: {
            mode: input.mode ?? mode,
            page: input.withoutPage ? undefined : page,
            mentions: input.mentions?.length ? input.mentions : undefined,
            command: input.command,
          },
        });
      });
    },
    [threadId, queryClient, mode, page, setOpen],
  );

  // ⌘J / Ctrl+J: paneli aç-kapat (⌘K oyun arama/ekleme için ayrılmış).
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, open, setOpen]);

  // Geniş ekranda panel sayfanın yanına sabitlenir; sayfa onun genişliği kadar daralır.
  const wide = useMediaQuery("(min-width: 1280px)");

  // Dar ekranda panel sayfanın üstünü kaplayan bir Sheet: içindeki bir bağlantıyla başka sayfaya geçilince
  // kapanır (yoksa sayfa arkada görünmeden değişiyordu). Geniş ekranda sabit panel yerinde kalır.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (!wide) setOpenState(false);
  }, [pathname, wide]);
  useEffect(() => {
    const docked = enabled && open && wide && !onPage;
    if (docked) document.documentElement.dataset.assistant = "docked";
    else delete document.documentElement.dataset.assistant;
    return () => {
      delete document.documentElement.dataset.assistant;
    };
  }, [enabled, open, wide, onPage]);

  const value = useMemo<AssistantContextValue>(
    () => ({
      enabled,
      open: open && !onPage,
      setOpen,
      toggle: () => setOpen(!open),
      onPage,
      threadId,
      selectThread,
      newThread,
      mode,
      setMode,
      page,
      markKnown: (id) => known.current.add(id),
      isKnownThread: (id) => known.current.has(id),
      ask,
      openPick: () => setPickOpen(true),
      openInterview: (entryId) => setInterview(entryId),
    }),
    [enabled, open, onPage, setOpen, threadId, selectThread, newThread, mode, setMode, page, ask],
  );

  return (
    <Context.Provider value={value}>
      {children}
      {enabled && (
        <Suspense fallback={null}>
          {pickOpen && <PickDialog open={pickOpen} onOpenChange={setPickOpen} />}
          {interview && (
            <InterviewDialog
              entryId={interview}
              onOpenChange={(next) => !next && setInterview(null)}
            />
          )}
        </Suspense>
      )}
    </Context.Provider>
  );
}
