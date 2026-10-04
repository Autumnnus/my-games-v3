import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import {
  BarChart3Icon,
  HouseIcon,
  InboxIcon,
  LayoutGridIcon,
  type LucideIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AssistantButton } from "@/components/assistant/header-button";
import { BrandMark } from "@/components/brand-mark";
import { NotificationBell } from "@/components/notification-bell";
import { CoachMark } from "@/components/onboarding/coach-mark";
import { useOnboarding } from "@/components/onboarding/provider";
import { useSpotlight } from "@/components/spotlight";
import { Button } from "@/components/ui/button";
import { proposalCountQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu } from "./user-menu";

function Logo() {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-3" aria-label={m.app_name()}>
      <BrandMark />
      {/* Başlığın kendi genişliğine göre (asistan paneli sabitlenince daralır), ekrana göre değil. */}
      <span className="font-display hidden truncate text-lg font-medium whitespace-nowrap @min-[1060px]/header:inline">
        {m.app_name()}
      </span>
    </Link>
  );
}

const navItem =
  "text-foreground/75 hover:text-foreground flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors @min-[960px]/header:px-4 data-[status=active]:bg-white/14 data-[status=active]:font-bold data-[status=active]:text-foreground [&_svg]:size-[18px] @min-[960px]/header:[&_svg]:hidden";

function NavLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon aria-hidden />
      {/* Dar başlıkta yalnızca simge kalır; ad ekran okuyucu ve ipucu için durur. */}
      <span className="sr-only @min-[960px]/header:not-sr-only">{label}</span>
    </>
  );
}

function InboxButton({ count, className }: { count: number; className?: string }) {
  return (
    <Button
      asChild
      variant="glass"
      size="icon-lg"
      className={`relative size-11 ${className ?? ""}`}
    >
      <Link to="/inbox" aria-label={`${m.nav_inbox()}${count ? ` (${count})` : ""}`}>
        <InboxIcon />
        {count > 0 && (
          <span className="bg-foreground text-background absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}

function SearchButton() {
  const spotlight = useSpotlight();
  const onboarding = useOnboarding();
  // ⌘K ipucu ilk oyun eklendikten sonra anlamlı (kütüphanede arayacak bir şey olunca).
  const hasGame = !!onboarding.state?.steps.some((step) => step.id === "game" && step.done);
  return (
    <>
      <CoachMark tip="spotlight" anchor="spotlight" when={hasGame} align="end" />
      <button
        type="button"
        data-tour="spotlight"
        onClick={spotlight.open}
        aria-label={`${m.action_search()} (⌘K)`}
        title={`${m.action_search()} (⌘K)`}
        className="glass text-foreground/85 hover:text-foreground flex h-11 shrink-0 items-center gap-2 rounded-full border border-white/12 pr-2 pl-3.5 transition-colors hover:bg-white/12"
      >
        <SearchIcon className="size-[18px] shrink-0" />
        {/* Kısayol her zaman düğmenin yanında görünür (asistanın ⌘J'si gibi). */}
        <kbd className="text-foreground/80 rounded-md bg-white/12 px-1.5 py-0.5 text-[11px] font-semibold">
          ⌘K
        </kbd>
      </button>
    </>
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
  const username = user?.displayUsername ?? user?.username;
  const pending = useQuery({ ...proposalCountQuery, enabled: !!user });
  const pendingCount = pending.data?.count ?? 0;

  return (
    <header
      // Sayfa geçişinde başlık yerinde kalır (bkz. styles.css `site-header`); yalnızca içerik geçer.
      style={{ viewTransitionName: "site-header" }}
      className={`sticky top-0 z-40 border-b transition-colors duration-300 ${
        scrolled ? "glass border-white/8" : "border-transparent"
      }`}
    >
      <div className="@container/header mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center">
            <Logo />
          </div>
          {user && username && (
            <nav
              aria-label={m.app_name()}
              className="glass hidden shrink-0 items-center gap-1 rounded-full border border-white/10 p-1 md:flex"
            >
              <Link to="/" activeOptions={{ exact: true }} className={navItem} title={m.nav_home()}>
                <NavLabel icon={HouseIcon} label={m.nav_home()} />
              </Link>
              <Link
                to="/u/$username/library"
                params={{ username }}
                activeOptions={{ includeSearch: false }}
                className={navItem}
                title={m.nav_library()}
              >
                <NavLabel icon={LayoutGridIcon} label={m.nav_library()} />
              </Link>
              <Link to="/users" className={navItem} title={m.nav_users()}>
                <NavLabel icon={UsersIcon} label={m.nav_users()} />
              </Link>
              <Link to="/stats" className={navItem} title={m.nav_stats()}>
                <NavLabel icon={BarChart3Icon} label={m.nav_stats()} />
              </Link>
            </nav>
          )}
          {/* min-w-0 yok: sağ küme sığmazsa sol taraf (logo) daralır, gezinme menüsünün üstüne binmez. */}
          <div className="flex flex-1 items-center justify-end gap-2">
            {user && (
              <div className="hidden items-center gap-2 md:flex">
                <SearchButton />
                <AssistantButton />
                <InboxButton count={pendingCount} />
              </div>
            )}
            {user && <AssistantButton compact />}
            {!user && <LocaleSwitcher />}
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
      </div>
    </header>
  );
}

const tabItem =
  "text-foreground/60 data-[status=active]:text-foreground flex h-14 w-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold";

/** Telefonda alt sekme çubuğu; masaüstünde üst menü yeterli. Ortadaki düğme Spotlight'ı açar. */
export function MobileTabBar() {
  const { user } = useRouteContext({ from: "__root__" });
  const spotlight = useSpotlight();
  const pending = useQuery({ ...proposalCountQuery, enabled: !!user });
  const username = user?.displayUsername ?? user?.username;
  if (!user || !username) return null;
  const count = pending.data?.count ?? 0;

  return (
    <nav
      aria-label={m.app_name()}
      style={{ viewTransitionName: "tab-bar" }}
      className="glass fixed inset-x-3 bottom-4 z-40 flex h-[72px] items-center justify-around rounded-[26px] border border-white/12 px-1.5 md:hidden"
    >
      <Link to="/" activeOptions={{ exact: true }} className={tabItem}>
        <HouseIcon className="size-[22px]" />
        {m.nav_home()}
      </Link>
      <Link
        to="/u/$username/library"
        params={{ username }}
        activeOptions={{ includeSearch: false }}
        className={tabItem}
      >
        <LayoutGridIcon className="size-[22px]" />
        {m.nav_library()}
      </Link>
      <button
        type="button"
        aria-label={m.action_search()}
        onClick={spotlight.open}
        className="bg-foreground text-background flex size-[54px] items-center justify-center rounded-full"
      >
        <SearchIcon className="size-6" strokeWidth={2.6} />
      </button>
      <Link to="/inbox" className={tabItem}>
        <span className="relative">
          <InboxIcon className="size-[22px]" />
          {count > 0 && (
            <span className="bg-foreground text-background absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold">
              {count > 99 ? "99+" : count}
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
