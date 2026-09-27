import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import {
  BarChart3Icon,
  BotIcon,
  HistoryIcon,
  InboxIcon,
  LibraryIcon,
  PlusIcon,
} from "lucide-react";
import { useAddGame } from "@/components/add-game";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { metaQuery } from "@/lib/meta";
import { proposalCountQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu } from "./user-menu";

export function SiteHeader() {
  const { user } = useRouteContext({ from: "__root__" });
  const addGame = useAddGame();
  const username = user?.displayUsername ?? user?.username;
  const pending = useQuery({ ...proposalCountQuery, enabled: !!user });
  const pendingCount = pending.data?.count ?? 0;
  const meta = useQuery(metaQuery);

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4">
        <Link to="/" className="mr-2 font-semibold">
          {m.app_name()}
        </Link>
        {user && username && (
          <nav className="hidden items-center gap-1 sm:flex">
            <Button asChild variant="ghost" size="sm">
              <Link to="/u/$username" params={{ username }}>
                <LibraryIcon />
                {m.nav_library()}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/inbox">
                <InboxIcon />
                {m.nav_inbox()}
                {pendingCount > 0 && (
                  <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] leading-4">
                    {pendingCount}
                  </span>
                )}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/history">
                <HistoryIcon />
                {m.nav_history()}
              </Link>
            </Button>
            {meta.data?.features.ai && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/chat" search={{}}>
                  <BotIcon />
                  {m.nav_chat()}
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link to="/stats">
                <BarChart3Icon />
                {m.nav_stats()}
              </Link>
            </Button>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {user && (
            <Button size="sm" onClick={() => addGame.open()}>
              <PlusIcon />
              <span className="hidden sm:inline">{m.action_add_game()}</span>
              <kbd className="bg-primary-foreground/20 ml-1 hidden rounded px-1 text-[10px] md:inline">
                ⌘K
              </kbd>
            </Button>
          )}
          <LocaleSwitcher />
          {user && <NotificationBell />}
          {user ? (
            <UserMenu user={user} />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">{m.nav_sign_in()}</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register">{m.nav_sign_up()}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
