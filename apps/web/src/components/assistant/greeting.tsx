import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  InboxIcon,
  NotebookPenIcon,
  ShuffleIcon,
  TrophyIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { GameCover } from "@/components/game-cover";
import { greetingFor, type Suggestion, suggestionsQuery } from "@/lib/assistant";
import { formatPlaytime, formatRating } from "@/lib/format";
import { useHydrated } from "@/lib/hydrated";
import { m } from "@/paraglide/messages";
import { Orb } from "./orb";
import { useAssistant, useMediaQuery } from "./provider";

const PRIVACY_KEY = "mg.ai.privacy-seen";

function SuggestionCard({
  icon,
  title,
  sub,
  badge,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[62px] w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/3.5 px-3 py-2.5 text-left transition-colors hover:border-white/16 hover:bg-white/7"
    >
      <span className="flex size-[38px] shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-white/7">
        {icon}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-bold">{title}</span>
        <span className="text-foreground/68 truncate text-[13px]">{sub}</span>
      </span>
      {badge ? (
        <span className="shrink-0 rounded-full bg-[#f2c77a]/16 px-2 py-0.5 text-[11px] font-bold text-[#f2c77a]">
          {badge}
        </span>
      ) : (
        <ChevronRightIcon className="text-foreground/40 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

function cover(game: { coverUrl: string | null; name: string; accentColor: string | null }) {
  return (
    <GameCover
      url={game.coverUrl}
      name={game.name}
      color={game.accentColor}
      className="h-full w-auto rounded-none ring-0"
    />
  );
}

/**
 * Boş sohbetin karşılaması: selam, sayfanın oyunu ve iki grup kart. Kartların hepsi veriden kurallarla
 * çıkar (model çağrılmaz); tıklanınca ya asistana hazır bir soru gider ya da ilgili akış açılır.
 */
export function Greeting() {
  const { user } = useRouteContext({ from: "__root__" });
  const hydrated = useHydrated();
  const assistant = useAssistant();
  const navigate = useNavigate();
  const wide = useMediaQuery("(min-width: 1280px)");
  const suggestions = useQuery({ ...suggestionsQuery(assistant.page), enabled: assistant.enabled });
  const [privacySeen, setPrivacySeen] = useState(true);
  useEffect(() => {
    try {
      setPrivacySeen(window.localStorage.getItem(PRIVACY_KEY) === "1");
    } catch {
      setPrivacySeen(false);
    }
  }, []);
  const pageGame = suggestions.data?.pageGame;

  function leave(to: () => void) {
    // Telefonda/tablette panel sayfanın üstünü kapatır; oraya giderken kapanır.
    if (!wide) assistant.setOpen(false);
    to();
  }

  function render(item: Suggestion) {
    switch (item.kind) {
      case "achievements":
        return (
          <SuggestionCard
            key="achievements"
            icon={<TrophyIcon className="size-[18px]" />}
            title={m.ai_suggest_achievements({ count: item.remaining })}
            sub={m.ai_suggest_achievements_sub()}
            onClick={() =>
              assistant.ask({
                text: m.ai_suggest_achievements_prompt({ game: item.game.name }),
                mentions: [{ type: "game", gameId: item.game.gameId, label: item.game.name }],
              })
            }
          />
        );
      case "compare":
        return (
          <SuggestionCard
            key="compare"
            icon={
              <span className="flex size-full items-center justify-center rounded-full bg-[#c2552d] text-sm font-bold">
                {item.user.name.slice(0, 1).toUpperCase()}
              </span>
            }
            title={m.ai_suggest_compare({ name: item.user.name })}
            sub={
              item.rating !== null
                ? m.ai_suggest_compare_sub({
                    rating: formatRating(item.rating * 10) ?? "",
                    hours: formatPlaytime(item.hours * 60),
                  })
                : m.ai_suggest_compare_sub_unrated({ hours: formatPlaytime(item.hours * 60) })
            }
            onClick={() =>
              assistant.ask({
                text: m.ai_suggest_compare_prompt(),
                mentions: [{ type: "user", username: item.user.username, label: item.user.name }],
                command: "compare",
              })
            }
          />
        );
      case "interview":
        return (
          <SuggestionCard
            key={`interview-${item.entryId}`}
            icon={<NotebookPenIcon className="size-[18px]" />}
            title={m.ai_suggest_interview({ game: item.game.name })}
            sub={m.ai_suggest_interview_sub()}
            onClick={() => assistant.openInterview(item.entryId)}
          />
        );
      case "recap":
        return (
          <SuggestionCard
            key={`recap-${item.entryId}`}
            icon={cover(item.game)}
            title={m.ai_suggest_recap({ game: item.game.name })}
            sub={m.ai_suggest_recap_sub({ days: item.daysAway })}
            onClick={() =>
              leave(() => void navigate({ to: "/e/$id", params: { id: item.entryId }, search: {} }))
            }
          />
        );
      case "inbox":
        return (
          <SuggestionCard
            key="inbox"
            icon={<InboxIcon className="size-[18px]" />}
            title={m.ai_suggest_inbox({ count: item.count })}
            sub={m.ai_suggest_inbox_sub()}
            onClick={() => leave(() => void navigate({ to: "/inbox" }))}
          />
        );
      case "pick":
        return (
          <SuggestionCard
            key="pick"
            icon={<ShuffleIcon className="size-[18px]" />}
            title={m.ai_suggest_pick()}
            sub={m.ai_suggest_pick_sub()}
            onClick={() => assistant.openPick()}
          />
        );
    }
  }

  return (
    <div className="grid gap-6 px-1 pt-6 pb-2">
      <div className="grid justify-items-center gap-1.5 text-center">
        <Orb color={pageGame?.accentColor} size={76} satellite />
        <h2 className="font-display m-0 mt-1 text-[21px] font-medium">
          {/* Selam saate bağlı: ilk karede (sunucu + hydration) saatten bağımsız metin, sonra saate göre. */}
          {hydrated
            ? greetingFor(user?.name ?? "")
            : m.home_welcome({ name: (user?.name ?? "").split(/\s+/)[0] ?? "" })}
        </h2>
        <p className="text-foreground/72 m-0 text-sm">
          {pageGame ? m.ai_greeting_page({ game: pageGame.name }) : m.ai_greeting_default()}
        </p>
      </div>
      {!!suggestions.data?.forPage.length && (
        <section className="grid gap-2">
          <h3 className="text-foreground/60 m-0 text-[11px] font-bold tracking-[0.16em]">
            {m.ai_section_page()}
          </h3>
          {suggestions.data.forPage.map(render)}
        </section>
      )}
      {!!suggestions.data?.general.length && (
        <section className="grid gap-2">
          <h3 className="text-foreground/60 m-0 text-[11px] font-bold tracking-[0.16em]">
            {m.ai_section_you()}
          </h3>
          {suggestions.data.general.map(render)}
        </section>
      )}
      {!privacySeen && (
        <div className="flex items-start gap-2 rounded-[14px] border border-white/8 bg-white/5 py-2.5 pr-2 pl-3">
          <p className="text-foreground/74 m-0 flex-1 text-xs leading-relaxed">{m.ai_privacy()}</p>
          <button
            type="button"
            aria-label={m.ai_privacy_dismiss()}
            onClick={() => {
              setPrivacySeen(true);
              try {
                window.localStorage.setItem(PRIVACY_KEY, "1");
              } catch {
                // Hatırlanamazsa bir dahaki sefere yine görünür.
              }
            }}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
