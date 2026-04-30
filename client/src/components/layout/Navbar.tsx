import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import { ThemeControls } from "@/components/theme/ThemeControls";
import { Avatar } from "@/components/ui/Avatar";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassPopover } from "@/components/ui/GlassPopover";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useUnreadCount } from "@/hooks/useNotifications";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/store/auth.store";
import { Link, useRouter } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Gamepad2,
  Heart,
  Image,
  LogOut,
  Menu,
  User,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const NAV_LINKS_AUTHED = [
  { to: "/games", labelKey: "navbar.library", icon: BookOpen },
  { to: "/wishlist", labelKey: "navbar.wishlist", icon: Heart },
  { to: "/statistics", labelKey: "navbar.statistics", icon: BarChart3 },
  { to: "/screenshots", labelKey: "navbar.screenshots", icon: Image },
  { to: "/social", labelKey: "navbar.social", icon: Activity },
  { to: "/users", labelKey: "navbar.users", icon: Users },
];

const NAV_LINKS_PUBLIC = [
  { to: "/users", labelKey: "navbar.users", icon: Users },
];

export function Navbar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const authed = !!token && !!user;

  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

  function handleLogout() {
    clearAuth();
    router.navigate({ to: "/login" });
  }

  return (
    <header className="glass-navbar sticky top-0 z-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 font-bold text-base shrink-0 text-text-primary"
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent to-accent-2">
            <Gamepad2 size={15} className="text-white" />
          </div>
          MyGames
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {(authed ? NAV_LINKS_AUTHED : NAV_LINKS_PUBLIC).map(
            ({ to, labelKey, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-secondary transition-colors"
                activeProps={{
                  className: "text-text-primary bg-glass-surface-hover",
                }}
              >
                <Icon size={15} />
                {t(labelKey)}
              </Link>
            ),
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto">
          {authed && user ? (
            <>
              {/* Notification bell */}
              <GlassPopover
                trigger={
                  <button
                    className={cn(
                      "relative p-2 rounded-xl transition-colors hover:bg-glass-surface-hover",
                      "text-text-muted",
                    )}
                    aria-label={t("translation:navbar.notifications")}
                  >
                    <Bell size={18} />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-accent text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </button>
                }
                align="end"
                sideOffset={8}
              >
                <NotificationPanel />
              </GlassPopover>

              {/* Profile */}
              <GlassPopover
                trigger={
                  <button className="flex items-center gap-2 px-2 py-1.5 rounded-xl glass-btn border-transparent">
                    <Avatar
                      src={user.profileImage}
                      name={user.name}
                      size="sm"
                    />
                    <span className="hidden sm:block text-sm text-text-secondary">
                      {user.name}
                    </span>
                  </button>
                }
                align="end"
                sideOffset={8}
                contentClassName="w-64 p-1"
              >
                <Link
                  to="/users/$id"
                  params={{ id: user._id }}
                  className="glass-panel-item"
                >
                  <User size={15} /> {t("translation:users.profile")}
                </Link>
                <Link to="/profile" className="glass-panel-item">
                  <User size={15} /> {t("translation:navbar.accountSettings")}
                </Link>
                <div className="my-1 border-t border-glass-border" />
                <ThemeControls />
                <div className="my-1 border-t border-glass-border" />
                <LanguageSwitcher />
                <div className="my-1 border-t border-glass-border" />
                <button
                  onClick={handleLogout}
                  className="glass-panel-item text-danger hover:bg-danger-soft"
                >
                  <LogOut size={15} /> {t("translation:navbar.signOut")}
                </button>
              </GlassPopover>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <GlassButton
                size="sm"
                onClick={() => router.navigate({ to: "/login" })}
              >
                {t("translation:navbar.signIn")}
              </GlassButton>
              <GlassButton
                size="sm"
                variant="primary"
                onClick={() => router.navigate({ to: "/register" })}
              >
                {t("translation:navbar.register")}
              </GlassButton>
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            className="md:hidden glass-btn p-1.5 rounded-lg"
            onClick={() => setMobileOpen((p) => !p)}
            aria-label="Menu"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="md:hidden border-t border-glass-border px-4 py-3 flex flex-col gap-1"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {(authed ? NAV_LINKS_AUTHED : NAV_LINKS_PUBLIC).map(
              ({ to, labelKey, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary"
                  activeProps={{
                    className: "text-text-primary bg-glass-surface-hover",
                  }}
                >
                  <Icon size={16} /> {t(labelKey)}
                </Link>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
