import { gameCoverUrl } from "@my-games/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, Maximize2Icon, PlusIcon, XIcon } from "lucide-react";
import { GameCover } from "@/components/game-cover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { chatThreadsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { Conversation } from "./conversation";
import { PatiSoundToggle } from "./mascot";
import { useMediaQuery, useOptionalAssistant } from "./provider";

const iconButton =
  "text-foreground/85 hover:text-foreground flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-white/10";

function ThreadPicker() {
  const assistant = useOptionalAssistant();
  const threads = useQuery({ ...chatThreadsQuery, enabled: !!assistant?.enabled });
  if (!assistant) return null;
  const current = threads.data?.threads.find((thread) => thread.id === assistant.threadId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={m.ai_history()}
        className="flex h-10 min-w-0 items-center gap-1.5 rounded-xl px-2.5 text-[15px] font-bold transition-colors hover:bg-white/10"
      >
        <span className="truncate">{current?.title ?? m.ai_new_chat()}</span>
        <ChevronDownIcon className="size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60dvh] w-80 overflow-y-auto">
        <DropdownMenuLabel>{m.ai_history()}</DropdownMenuLabel>
        {threads.data?.threads.length === 0 && (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">{m.ai_no_threads()}</p>
        )}
        {threads.data?.threads.slice(0, 20).map((thread) => (
          <DropdownMenuItem
            key={thread.id}
            onSelect={() => assistant.selectThread(thread.id)}
            className="gap-2.5"
          >
            {thread.game?.id ? (
              <GameCover
                url={gameCoverUrl(
                  { coverImageId: thread.game.coverImageId, coverUrl: thread.game.coverUrl },
                  "cover_small",
                )}
                name={thread.game.name ?? ""}
                color={thread.game.accentColor}
                className="w-5 shrink-0 rounded"
              />
            ) : (
              <span className="h-[30px] w-5 shrink-0 rounded bg-white/8" />
            )}
            <span className={`truncate ${thread.id === assistant.threadId ? "font-bold" : ""}`}>
              {thread.title ?? m.ai_new_chat()}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PanelBody() {
  const assistant = useOptionalAssistant();
  if (!assistant) return null;
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-2 border-b border-white/7 pr-2.5 pl-3">
        <ThreadPicker />
        <div className="flex shrink-0 gap-0.5">
          <PatiSoundToggle className={iconButton} />
          <button
            type="button"
            aria-label={m.ai_new_chat()}
            onClick={assistant.newThread}
            className={iconButton}
          >
            <PlusIcon className="size-[18px]" />
          </button>
          <Link
            to="/ai"
            search={{ t: assistant.threadId }}
            aria-label={m.ai_expand()}
            className={iconButton}
          >
            <Maximize2Icon className="size-4" />
          </Link>
          <button
            type="button"
            aria-label={m.ai_close()}
            onClick={() => assistant.setOpen(false)}
            className={iconButton}
          >
            <XIcon className="size-[18px]" />
          </button>
        </div>
      </header>
      <Conversation key={assistant.threadId} threadId={assistant.threadId} autoFocus />
    </div>
  );
}

/**
 * Pati (AI asistan) paneli. Geniş ekranda sayfanın sağına sabitlenir ve sayfa onun kadar daralır (Cloudflare
 * gibi; sayfa kullanılmaya devam eder). Daha dar ekranlarda sağdan, telefonda alttan açılan bir sayfa olur.
 * Tam ekran görünümde (/ai) gösterilmez.
 */
export function AssistantPanel() {
  const assistant = useOptionalAssistant();
  const wide = useMediaQuery("(min-width: 1280px)");
  const phone = useMediaQuery("(max-width: 767px)");
  if (!assistant?.enabled || assistant.onPage) return null;

  if (wide) {
    if (!assistant.open) return null;
    return (
      <aside
        aria-label={m.ai_name()}
        className="animate-in slide-in-from-right-8 fade-in fixed inset-y-0 right-0 z-50 w-[440px] border-l border-white/10 bg-[#0f1015] shadow-[-40px_0_80px_-30px_rgba(0,0,0,0.85)] duration-300"
      >
        <PanelBody />
      </aside>
    );
  }

  return (
    <Sheet open={assistant.open} onOpenChange={assistant.setOpen}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        showCloseButton={false}
        // Odak ilk düğmeye (sohbet seçici) değil mesaj kutusuna gitsin (kutunun kendi autoFocus'u).
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={
          phone
            ? "h-[92dvh] gap-0 rounded-t-[28px] border-white/12 bg-[#111217] p-0"
            : "w-[440px] gap-0 border-white/10 bg-[#0f1015] p-0 sm:max-w-[440px]"
        }
      >
        <SheetTitle className="sr-only">{m.ai_name()}</SheetTitle>
        <SheetDescription className="sr-only">{m.ai_placeholder()}</SheetDescription>
        {phone && (
          <span className="mx-auto mt-2 h-[5px] w-[38px] shrink-0 rounded-full bg-white/25" />
        )}
        <PanelBody />
      </SheetContent>
    </Sheet>
  );
}
