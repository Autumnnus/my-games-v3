import { Link, useNavigate } from "@tanstack/react-router";
import {
  HistoryIcon,
  InboxIcon,
  LibraryIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
} from "lucide-react";
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
import { type CurrentUser, useRefreshSession } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function UserMenu({ user }: { user: CurrentUser }) {
  const refreshSession = useRefreshSession();
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    await refreshSession();
    await navigate({ to: "/" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="size-8">
            {user.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{user.name}</div>
          {user.displayUsername && (
            <div className="text-muted-foreground text-xs">@{user.displayUsername}</div>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.displayUsername && (
          <DropdownMenuItem asChild className="sm:hidden">
            <Link to="/u/$username" params={{ username: user.displayUsername }}>
              <LibraryIcon />
              {m.nav_library()}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className="sm:hidden">
          <Link to="/inbox">
            <InboxIcon />
            {m.nav_inbox()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="sm:hidden">
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
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOutIcon />
          {m.nav_sign_out()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
