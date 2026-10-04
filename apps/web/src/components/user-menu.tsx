import { Link, useNavigate } from "@tanstack/react-router";
import {
  CompassIcon,
  HistoryIcon,
  InboxIcon,
  LayoutGridIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import { useOnboarding } from "@/components/onboarding/provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { avatarThumb } from "@/lib/media/urls";
import { type CurrentUser, useRefreshSession } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function UserMenu({ user }: { user: CurrentUser }) {
  const refreshSession = useRefreshSession();
  const navigate = useNavigate();
  const username = user.displayUsername ?? user.username;
  const onboarding = useOnboarding();
  // Gizlenen başlangıç listesi rehber süresince buradan geri getirilebilir.
  const hidden = onboarding.state?.dismissed ? onboarding.state : null;

  async function signOut() {
    await authClient.signOut();
    await refreshSession();
    await navigate({ to: "/" });
  }

  return (
    // modal={false}: menü açıkken sayfa kilitlenmez, kaydırma çubuğu kaybolup sabit öğeler kaymaz ve menü
    // dışına yapılan ilk tıklama yutulmaz.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={user.name}>
          <Avatar className="size-8">
            {user.image && <AvatarImage src={avatarThumb(user.image)} alt="" />}
            <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-medium">{user.name}</div>
          {username && <div className="text-muted-foreground truncate text-xs">@{username}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {username && (
          <DropdownMenuItem asChild>
            <Link to="/u/$username" params={{ username }}>
              <UserRoundIcon />
              {m.nav_profile()}
            </Link>
          </DropdownMenuItem>
        )}
        {username && (
          <DropdownMenuItem asChild className="md:hidden">
            <Link to="/u/$username/library" params={{ username }}>
              <LayoutGridIcon />
              {m.nav_library()}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className="md:hidden">
          <Link to="/users">
            <UsersIcon />
            {m.nav_users()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="md:hidden">
          <Link to="/inbox">
            <InboxIcon />
            {m.nav_inbox()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/history">
            <HistoryIcon />
            {m.nav_history()}
          </Link>
        </DropdownMenuItem>
        {user.role === "admin" && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldIcon />
              {m.nav_admin()}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <SettingsIcon />
            {m.nav_settings()}
          </Link>
        </DropdownMenuItem>
        {hidden && (
          <DropdownMenuItem
            onSelect={() => {
              void navigate({ to: "/" });
              // Menü önce kapansın: öğe aynı anda kaybolursa menü açık kalıyordu.
              window.setTimeout(onboarding.restore, 0);
            }}
          >
            <CompassIcon />
            {m.onboarding_menu_restore({
              done: hidden.steps.filter((step) => step.done).length,
              total: hidden.steps.length,
            })}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOutIcon />
          {m.nav_sign_out()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
