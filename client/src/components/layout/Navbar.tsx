import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  Gamepad2,
  LogOut,
  User,
  Menu,
  X,
  BookOpen,
  Heart,
  Image,
  Users,
  Activity,
  Bell,
  BarChart3,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/auth.store";
import { Avatar } from "@/components/ui/Avatar";
import { GlassButton } from "@/components/ui/GlassButton";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import { ThemeControls } from "@/components/theme/ThemeControls";
import { useUnreadCount } from "@/hooks/useNotifications";

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
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const authed = !!token && !!user;

  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

  function handleLogout() {
    clearAuth();
    setProfileOpen(false);
    router.navigate({ to: "/login" });
  }

  return (
    <header className="glass-navbar sticky top-0 z-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 font-bold text-base shrink-0"
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, var(--theme-accent), var(--theme-accent-2))",
            }}
          >
            <Gamepad2 size={15} className="text-white" />
          </div>
          <span style={{ color: "var(--theme-text-primary)" }}>MyGames</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {(authed ? NAV_LINKS_AUTHED : NAV_LINKS_PUBLIC).map(
            ({ to, labelKey, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
                style={{ color: "var(--theme-text-secondary)" }}
                activeProps={{
                  style: {
                    color: "var(--theme-text-primary)",
                    background: "var(--theme-glass-surface-hover)",
                  },
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
              <div className="relative">
                <button
                  onClick={() => {
                    setNotifOpen((p) => !p);
                    setProfileOpen(false);
                  }}
                  className="relative p-2 rounded-xl transition-colors hover:bg-white/5"
                  style={{
                    color: notifOpen
                      ? "var(--theme-text-primary)"
                      : "var(--theme-text-muted)",
                  }}
                  aria-label={t("navbar.notifications")}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span
                      className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                      style={{
                        background: "var(--theme-accent)",
                        color: "#fff",
                      }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>
                <NotificationPanel
                  open={notifOpen}
                  onClose={() => setNotifOpen(false)}
                />
              </div>

              {/* Profile */}
              <div className="relative">
                <button
                  onClick={() => {
                    setProfileOpen((p) => !p);
                    setNotifOpen(false);
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-xl glass-btn border-transparent"
                >
                  <Avatar src={user.profileImage} name={user.name} size="sm" />
                  <span
                    className="hidden sm:block text-sm"
                    style={{ color: "var(--theme-text-secondary)" }}
                  >
                    {user.name}
                  </span>
                </button>

                <AnimatePresence>
                  {profileOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setProfileOpen(false)}
                      />
                      <motion.div
                        className="absolute right-0 top-full mt-2 w-64 p-1 z-20"
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 30,
                        }}
                        style={{
                          background: "rgba(20, 22, 30, 0.75)",
                          backdropFilter: "blur(60px) saturate(220%)",
                          WebkitBackdropFilter: "blur(60px) saturate(220%)",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: "14px",
                          boxShadow: "inset 0 1px 0 var(--theme-glass-border), 0 25px 60px rgba(0,0,0,0.4)",
                        }}
                      >
                        <Link
                          to="/users/$id"
                          params={{ id: user._id }}
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
                          style={{ color: "var(--theme-text-secondary)" }}
                        >
                          <User size={15} /> {t("users.profile")}
                        </Link>
                        <Link
                          to="/profile"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
                          style={{ color: "var(--theme-text-secondary)" }}
                        >
                          <User size={15} /> {t("navbar.accountSettings")}
                        </Link>
                        <div className="my-1 border-t border-white/8" />
                        <ThemeControls />
                        <div className="my-1 border-t border-white/8" />
                        <LanguageSwitcher />
                        <div className="my-1 border-t border-white/8" />
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-red-500/10 text-left"
                          style={{ color: "rgba(239,68,68,0.85)" }}
                        >
                          <LogOut size={15} /> {t("navbar.signOut")}
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <GlassButton
                size="sm"
                onClick={() => router.navigate({ to: "/login" })}
              >
                {t("navbar.signIn")}
              </GlassButton>
              <GlassButton
                size="sm"
                variant="primary"
                onClick={() => router.navigate({ to: "/register" })}
              >
                {t("navbar.register")}
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
            className="md:hidden border-t border-white/8 px-4 py-3 flex flex-col gap-1"
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
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                style={{ color: "var(--theme-text-secondary)" }}
                activeProps={{
                  style: {
                    color: "var(--theme-text-primary)",
                    background: "var(--theme-glass-surface-hover)",
                  },
                }}
              >
                <Icon size={16} /> {t(labelKey)}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
