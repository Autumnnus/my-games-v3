import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  Gamepad2,
  LogOut,
  User,
  Menu,
  X,
  BookOpen,
  Image,
  Users,
  Activity,
  Bell,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/auth.store";
import { Avatar } from "@/components/ui/Avatar";
import { GlassButton } from "@/components/ui/GlassButton";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import { useUnreadCount } from "@/hooks/useNotifications";

const NAV_LINKS_AUTHED = [
  { to: "/games", label: "Kütüphane", icon: BookOpen },
  { to: "/screenshots", label: "Ekran Görüntüleri", icon: Image },
  { to: "/social", label: "Sosyal", icon: Activity },
  { to: "/users", label: "Kullanıcılar", icon: Users },
];

const NAV_LINKS_PUBLIC = [
  { to: "/users", label: "Kullanıcılar", icon: Users },
];

export function Navbar() {
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
            style={{ background: "linear-gradient(135deg, #a855f7, #3b82f6)" }}
          >
            <Gamepad2 size={15} className="text-white" />
          </div>
          <span style={{ color: "rgba(255,255,255,0.9)" }}>MyGames</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {(authed ? NAV_LINKS_AUTHED : NAV_LINKS_PUBLIC).map(
            ({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
                style={{ color: "rgba(255,255,255,0.6)" }}
                activeProps={{
                  style: {
                    color: "rgba(255,255,255,0.95)",
                    background: "rgba(255,255,255,0.07)",
                  },
                }}
              >
                <Icon size={15} />
                {label}
              </Link>
            ),
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto">
          {authed && user ? (
            <>
              {/* Bildirim zili */}
              <div className="relative">
                <button
                  onClick={() => {
                    setNotifOpen((p) => !p);
                    setProfileOpen(false);
                  }}
                  className="relative p-2 rounded-xl transition-colors hover:bg-white/5"
                  style={{
                    color: notifOpen
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(255,255,255,0.5)",
                  }}
                  aria-label="Bildirimler"
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span
                      className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                      style={{ background: "#a855f7", color: "#fff" }}
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

              {/* Profil */}
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
                    style={{ color: "rgba(255,255,255,0.8)" }}
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
                        className="absolute right-0 top-full mt-2 w-52 glass-card p-1 z-20"
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 30,
                        }}
                      >
                        <Link
                          to="/users/$id"
                          params={{ id: user._id }}
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
                          style={{ color: "rgba(255,255,255,0.75)" }}
                        >
                          <User size={15} /> Profil
                        </Link>
                        <Link
                          to="/profile"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
                          style={{ color: "rgba(255,255,255,0.75)" }}
                        >
                          <User size={15} /> Hesap Ayarları
                        </Link>
                        <div className="my-1 border-t border-white/8" />
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-red-500/10 text-left"
                          style={{ color: "rgba(239,68,68,0.85)" }}
                        >
                          <LogOut size={15} /> Çıkış Yap
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
                Giriş Yap
              </GlassButton>
              <GlassButton
                size="sm"
                variant="primary"
                onClick={() => router.navigate({ to: "/register" })}
              >
                Kayıt Ol
              </GlassButton>
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            className="md:hidden glass-btn p-1.5 rounded-lg"
            onClick={() => setMobileOpen((p) => !p)}
            aria-label="Menü"
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
              ({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                style={{ color: "rgba(255,255,255,0.7)" }}
                activeProps={{
                  style: {
                    color: "rgba(255,255,255,0.95)",
                    background: "rgba(255,255,255,0.07)",
                  },
                }}
              >
                <Icon size={16} /> {label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
