import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import {
  BarChart3Icon,
  HouseIcon,
  InboxIcon,
  LayoutGridIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAddGame } from "@/components/add-game";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { metaQuery } from "@/lib/meta";
import { proposalCountQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu } from "./user-menu";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label={m.app_name()}>
      <span className="bg-foreground text-background flex size-9 items-center justify-center rounded-[10px]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M5 7h14" />
          <path d="M5 12h10" />
          <path d="M5 17h6" />
        </svg>
      </span>
      <span className="font-display hidden text-lg font-medium sm:inline">{m.app_name()}</span>
    </Link>
  );
}

const navItem =
  "text-foreground/75 hover:text-foreground flex h-10 items-center rounded-full px-5 text-sm font-medium transition-colors data-[status=active]:bg-white/14 data-[status=active]:font-bold data-[status=active]:text-foreground";

function InboxButton({ count, className }: { count: number; className?: string }) {
  return (
    <Button asChild variant="glass" size="icon-lg" className={`relative ${className ?? ""}`}>
      <Link to="/inbox" aria-label={`${m.nav_inbox()}${count ? ` (${count})` : ""}`}>
        <InboxIcon />
        {count > 0 && (
          <span className="bg-foreground text-background absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">
            {count}
          </span>
        )}
      </Link>
    </Button>
  );
}

/** Sayfa kaydırılınca başlık cam zemine geçer; en üstte sahnenin önünde şeffaf durur. */
function useScrolled(offset = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > offset);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [offset]);
  return scrolled;
}

export function SiteHeader() {
  const { user } = useRouteContext({ from: "__root__" });
  const scrolled = useScrolled();
  const addGame = useAddGame();
  const username = user?.displayUsername ?? user?.username;
  const pending = useQuery({ ...proposalCountQuery, enabled: !!user });
  const pendingCount = pending.data?.count ?? 0;
  const meta = useQuery(metaQuery);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-colors duration-300 ${
        scrolled ? "glass border-white/8" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-1 items-center">
          <Logo />
        </div>
        {user && username && (
          <nav
            aria-label={m.app_name()}
            className="glass hidden items-center gap-1 rounded-full border border-white/10 p-1 md:flex"
          >
            <Link to="/" activeOptions={{ exact: true }} className={navItem}>
              {m.nav_home()}
            </Link>
            <Link to="/u/$username" params={{ username }} className={navItem}>
              {m.nav_library()}
            </Link>
            <Link to="/stats" className={navItem}>
              {m.nav_stats()}
            </Link>
            {meta.data?.features.ai && (
              <Link to="/chat" search={{}} className={navItem}>
                {m.nav_chat()}
              </Link>
            )}
          </nav>
        )}
        <div className="flex flex-1 items-center justify-end gap-2">
          {user && (
            <Button
              variant="glass"
              className="hidden h-11 gap-3 pr-2.5 pl-4 font-medium md:inline-flex"
              onClick={() => addGame.open()}
            >
              <SearchIcon />
              <span className="text-foreground/80">{m.action_search()}</span>
              <kbd className="rounded-md border border-white/20 px-1.5 text-[11px]">⌘K</kbd>
            </Button>
          )}
          {user && <InboxButton count={pendingCount} className="hidden md:inline-flex" />}
          <LocaleSwitcher />
          {user && <NotificationBell />}
          {user ? (
            <UserMenu user={user} />
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link to="/login">{m.nav_sign_in()}</Link>
              </Button>
              <Button asChild>
                <Link to="/register">{m.nav_sign_up()}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const tabItem =
  "text-foreground/60 data-[status=active]:text-foreground flex h-14 w-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold";

/** Telefonda alt sekme çubuğu; masaüstünde üst menü yeterli. */
export function MobileTabBar() {
  const { user } = useRouteContext({ from: "__root__" });
  const addGame = useAddGame();
  const pending = useQuery({ ...proposalCountQuery, enabled: !!user });
  const username = user?.displayUsername ?? user?.username;
  if (!user || !username) return null;
  const count = pending.data?.count ?? 0;

  return (
    <nav
      aria-label={m.app_name()}
      className="glass fixed inset-x-3 bottom-4 z-40 flex h-[72px] items-center justify-around rounded-[26px] border border-white/12 px-1.5 md:hidden"
    >
      <Link to="/" activeOptions={{ exact: true }} className={tabItem}>
        <HouseIcon className="size-[22px]" />
        {m.nav_home()}
      </Link>
      <Link to="/u/$username" params={{ username }} className={tabItem}>
        <LayoutGridIcon className="size-[22px]" />
        {m.nav_library()}
      </Link>
      <button
        type="button"
        aria-label={m.action_add_game()}
        onClick={() => addGame.open()}
        className="bg-foreground text-background flex size-[54px] items-center justify-center rounded-full"
      >
        <PlusIcon className="size-6" strokeWidth={2.6} />
      </button>
      <Link to="/inbox" className={tabItem}>
        <span className="relative">
          <InboxIcon className="size-[22px]" />
          {count > 0 && (
            <span className="bg-foreground text-background absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold">
              {count}
            </span>
          )}
        </span>
        {m.nav_inbox()}
      </Link>
      <Link to="/stats" className={tabItem}>
        <BarChart3Icon className="size-[22px]" />
        {m.nav_stats()}
      </Link>
    </nav>
  );
}
