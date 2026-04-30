import { AddGameModal } from "@/components/games/AddGameModal";
import { HeroSection } from "@/components/home/HeroSection";
import { RecentGamesRow } from "@/components/home/RecentGamesRow";
import { StatsSummaryRow } from "@/components/home/StatsSummaryRow";
import { PageContainer } from "@/components/layout/PageContainer";
import { GlassButton } from "@/components/ui/GlassButton";
import { useUserGames } from "@/hooks/useGames";
import { pageTransition } from "@/lib/motion";
import { apiFetch } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Plus, Bell } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const authed = isAuthenticated();

  if (!authed) return <HeroSection />;

  return <Dashboard />;
}

function Dashboard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user!);
  const [addOpen, setAddOpen] = useState(false);

  const { data: recentData } = useUserGames({
    sortBy: "lastPlay",
    order: "desc",
  });
  const { data: favData } = useUserGames({ sortBy: "lastPlay", order: "desc" });

  const recentGames = recentData?.pages[0]?.items.slice(0, 8) ?? [];
  const favoriteGames =
    favData?.pages[0]?.items.filter((g) => g.isFavorite).slice(0, 8) ?? [];
  const totalPlayTime =
    recentData?.pages
      .flatMap((p) => p.items)
      .reduce((acc, g) => acc + g.playTime, 0) ?? 0;

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Welcome hero */}
      <div className="relative py-12 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-0 left-1/4 w-64 h-64 rounded-full opacity-10"
            style={{
              background:
                "radial-gradient(circle, var(--theme-accent), transparent)",
              filter: "blur(40px)",
            }}
          />
          <div
            className="absolute bottom-0 right-1/4 w-48 h-48 rounded-full opacity-8"
            style={{
              background:
                "radial-gradient(circle, var(--theme-accent-2), transparent)",
              filter: "blur(40px)",
            }}
          />
        </div>

        <PageContainer>
          <div className="flex items-center justify-between gap-4">
            <div>
              <motion.h1
                className="text-3xl font-bold text-text-primary"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
              >
                {t("translation:pages.dashboard.welcome", { name: user.name })}{" "}
                👋
              </motion.h1>
              <motion.p
                className="text-sm mt-1 text-text-muted"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                {t("translation:pages.dashboard.continueLibrary")}
              </motion.p>
            </div>
            <div className="flex items-center gap-2">
              {import.meta.env.DEV && (
                <GlassButton
                  variant="ghost"
                  leftIcon={<Bell size={15} />}
                  onClick={() => apiFetch("/api/notifications/test", { method: "POST" })}
                >
                  Test Bildirim
                </GlassButton>
              )}
              <GlassButton
                variant="primary"
                leftIcon={<Plus size={15} />}
                onClick={() => setAddOpen(true)}
              >
                {t("translation:pages.dashboard.addGame")}
              </GlassButton>
            </div>
          </div>
        </PageContainer>
      </div>

      <PageContainer>
        <div className="flex flex-col gap-8">
          {/* Stats */}
          <StatsSummaryRow user={user} totalPlayTime={totalPlayTime} />

          {/* Recent games */}
          {recentGames.length > 0 && (
            <RecentGamesRow
              games={recentGames}
              title={t("translation:pages.dashboard.recentlyPlayed")}
            />
          )}

          {/* Favorites */}
          {favoriteGames.length > 0 && (
            <RecentGamesRow
              games={favoriteGames}
              title={t("translation:pages.dashboard.favorites")}
            />
          )}

          {/* Quick links */}
          {recentGames.length === 0 && (
            <div className="text-center py-12 flex flex-col items-center gap-4">
              <p className="text-lg font-semibold text-text-secondary">
                {t("translation:pages.dashboard.emptyLibrary")}
              </p>
              <GlassButton
                variant="primary"
                leftIcon={<Plus size={15} />}
                onClick={() => setAddOpen(true)}
                size="lg"
              >
                {t("translation:pages.dashboard.firstGameToLibrary")}
              </GlassButton>
            </div>
          )}
        </div>
      </PageContainer>

      <AddGameModal open={addOpen} onClose={() => setAddOpen(false)} />
    </motion.div>
  );
}
