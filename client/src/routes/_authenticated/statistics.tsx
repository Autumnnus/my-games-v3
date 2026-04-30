import { statisticsApi } from "@/api/statistics.api";
import { PageContainer } from "@/components/layout/PageContainer";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { useAuthStore } from "@/store/auth.store";
import type { UserAggregateStatistics } from "@my-games/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { BarChart3, Clock, Gamepad2, Star, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";

// ─── Stat Card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  return (
    <motion.div variants={fadeUp}>
      <GlassCard className="p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${color}22`, border: `1px solid ${color}33` }}
          >
            <Icon size={15} style={{ color }} />
          </div>
          <span className="text-xs leading-tight text-text-muted">{label}</span>
        </div>
        <span className="text-2xl font-bold leading-none text-text-primary">
          {value}
        </span>
      </GlassCard>
    </motion.div>
  );
}

// ─── Horizontal Bar ────────────────────────────────────────────────────────────
interface BarItem {
  label: string;
  count: number;
  maxCount: number;
  color: string;
}

function HorizontalBar({ label, count, maxCount, color }: BarItem) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted">{count}</span>
      </div>
      <div className="h-1.5 rounded-full bg-glass-surface-hover overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────
interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <GlassCard className="p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
      {children}
    </GlassCard>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <BarChart3 size={48} className="text-white/20" />
      <p className="text-sm text-text-muted">
        {t("translation:statistics.noData")}
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/_authenticated/statistics")({
  component: StatisticsPage,
});

function StatisticsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["user-statistics", user?._id],
    queryFn: () => statisticsApi.getUserStats(user!._id),
    enabled: !!user?._id,
  });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner />
        </div>
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <EmptyState />
      </PageContainer>
    );
  }

  const stats: UserAggregateStatistics = data;

  const fmtTime = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    return `${h}${t("translation:statistics.hoursAbbrev")}`;
  };

  const statCards = [
    {
      icon: Gamepad2,
      label: t("translation:statistics.totalGames"),
      value: stats.summary.totalGames,
      color: "var(--theme-accent)",
    },
    {
      icon: Trophy,
      label: t("translation:statistics.completed"),
      value: stats.summary.completedCount,
      color: "#22c55e",
    },
    {
      icon: Clock,
      label: t("translation:statistics.totalPlayTime"),
      value: fmtTime(stats.summary.totalPlayTime),
      color: "var(--theme-accent-2)",
    },
    {
      icon: Star,
      label: t("translation:statistics.avgRating"),
      value: stats.summary.avgRating ? stats.summary.avgRating.toFixed(1) : "—",
      color: "#f59e0b",
    },
  ];

  const maxPlatform = Math.max(...stats.platformStats.map((p) => p.count), 1);
  const maxGenre = Math.max(...stats.genreStats.map((g) => g.count), 1);

  const platformColors = [
    "var(--theme-accent)",
    "var(--theme-accent-2)",
    "#22c55e",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
    "#8b5cf6",
    "#ec4899",
  ];
  const genreColors = [
    "var(--theme-accent-2)",
    "#22c55e",
    "var(--theme-accent)",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
    "#8b5cf6",
    "#ec4899",
  ];

  return (
    <PageContainer>
      <motion.div
        className="max-w-4xl mx-auto flex flex-col gap-6"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* Title */}
        <motion.div variants={fadeUp}>
          <h1 className="text-2xl font-bold text-text-primary">
            {t("translation:statistics.title")}
          </h1>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        {/* Platform Distribution */}
        {stats.platformStats.length > 0 && (
          <motion.div variants={fadeUp}>
            <Section title={t("translation:statistics.platformDistribution")}>
              <div className="flex flex-col gap-3">
                {stats.platformStats.map((p, i) => (
                  <HorizontalBar
                    key={p.platform}
                    label={p.platform}
                    count={p.count}
                    maxCount={maxPlatform}
                    color={platformColors[i % platformColors.length]}
                  />
                ))}
              </div>
            </Section>
          </motion.div>
        )}

        {/* Genre Distribution */}
        {stats.genreStats.length > 0 && (
          <motion.div variants={fadeUp}>
            <Section title={t("translation:statistics.genreDistribution")}>
              <div className="flex flex-col gap-3">
                {stats.genreStats.slice(0, 8).map((g, i) => (
                  <HorizontalBar
                    key={g.genre}
                    label={g.genre}
                    count={g.count}
                    maxCount={maxGenre}
                    color={genreColors[i % genreColors.length]}
                  />
                ))}
              </div>
            </Section>
          </motion.div>
        )}

        {/* Rating Distribution */}
        {stats.ratingStats.some((r) => r.count > 0) && (
          <motion.div variants={fadeUp}>
            <Section title={t("translation:statistics.ratingDistribution")}>
              <div className="flex flex-col gap-3">
                {stats.ratingStats.map((r) => (
                  <HorizontalBar
                    key={r.range}
                    label={r.range}
                    count={r.count}
                    maxCount={Math.max(
                      ...stats.ratingStats.map((s) => s.count),
                      1,
                    )}
                    color="#f59e0b"
                  />
                ))}
              </div>
            </Section>
          </motion.div>
        )}

        {/* Status Distribution */}
        {(() => {
          const total = stats.summary.totalGames;
          if (total === 0) return null;
          const statuses = [
            {
              label: t("translation:statistics.completed"),
              count: stats.summary.completedCount,
              color: "#22c55e",
            },
            {
              label: t("translation:statistics.playing"),
              count: stats.summary.playingCount,
              color: "var(--theme-accent-2)",
            },
            {
              label: t("translation:statistics.backlog"),
              count: stats.summary.backlogCount,
              color: "var(--theme-accent)",
            },
            {
              label: t("translation:statistics.dropped"),
              count: stats.summary.droppedCount,
              color: "#ef4444",
            },
          ].filter((s) => s.count > 0);

          return (
            <motion.div variants={fadeUp}>
              <Section title={t("translation:statistics.statusDistribution")}>
                <div className="flex flex-col gap-3">
                  {statuses.map((s) => (
                    <HorizontalBar
                      key={s.label}
                      label={s.label}
                      count={s.count}
                      maxCount={total}
                      color={s.color}
                    />
                  ))}
                </div>
              </Section>
            </motion.div>
          );
        })()}
      </motion.div>
    </PageContainer>
  );
}
