import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Gamepad2,
  CheckCircle,
  Image,
  Clock,
  Activity,
} from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassBadge } from "@/components/ui/GlassBadge";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { GameCard } from "@/components/games/GameCard";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useUser } from "@/hooks/useUsers";
import { useUserGamesById } from "@/hooks/useGames";
import { useUserActivity } from "@/hooks/useActivity";
import { formatPlayTime } from "@/lib/formatters";
import { pageTransition, staggerContainer } from "@/lib/motion";

export const Route = createFileRoute("/users/$id")({
  component: UserProfilePage,
});

type Tab = "games" | "activity";

function UserProfilePage() {
  const { id } = Route.useParams();
  const { data: user, isLoading } = useUser(id);
  const { data: gamesData } = useUserGamesById(id);
  const games = gamesData?.pages.flatMap((p) => p.items).slice(0, 12) ?? [];
  const totalPlayTime = games.reduce((acc, g) => acc + g.playTime, 0);

  const [tab, setTab] = useState<Tab>("games");
  const [activityPage, setActivityPage] = useState(1);
  const activityFeed = useUserActivity(id, activityPage);

  const ROLE_COLORS: Record<string, string> = {
    admin: "#ef4444",
    vip: "#f59e0b",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-56px)]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <PageContainer>
        <div
          className="text-center py-20"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          Kullanıcı bulunamadı.
        </div>
      </PageContainer>
    );
  }

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <PageContainer>
        <div className="flex flex-col gap-6">
          {/* Back link */}
          <div>
            <Link
              to="/users"
              className="inline-flex items-center gap-1.5 text-sm mb-4 hover:underline"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              <ArrowLeft size={14} /> Kullanıcılar
            </Link>

            {/* Profile card */}
            <GlassCard className="p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <Avatar src={user.profileImage} name={user.name} size="xl" />
              <div className="flex-1 flex flex-col gap-2 text-center sm:text-left">
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <h1
                    className="text-2xl font-bold"
                    style={{ color: "rgba(255,255,255,0.95)" }}
                  >
                    {user.name}
                  </h1>
                  {user.role !== "user" && (
                    <GlassBadge
                      color={ROLE_COLORS[user.role]}
                      className="capitalize"
                    >
                      {user.role}
                    </GlassBadge>
                  )}
                </div>

                <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start mt-2">
                  <div
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    <Gamepad2 size={14} />{" "}
                    <strong style={{ color: "rgba(255,255,255,0.9)" }}>
                      {user.gameSize}
                    </strong>{" "}
                    oyun
                  </div>
                  <div
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    <CheckCircle size={14} />{" "}
                    <strong style={{ color: "rgba(255,255,255,0.9)" }}>
                      {user.completedGameSize}
                    </strong>{" "}
                    tamamlanan
                  </div>
                  <div
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    <Image size={14} />{" "}
                    <strong style={{ color: "rgba(255,255,255,0.9)" }}>
                      {user.screenshotSize}
                    </strong>{" "}
                    ekran görüntüsü
                  </div>
                  {totalPlayTime > 0 && (
                    <div
                      className="flex items-center gap-1.5 text-sm"
                      style={{ color: "rgba(255,255,255,0.6)" }}
                    >
                      <Clock size={14} />{" "}
                      <strong style={{ color: "rgba(255,255,255,0.9)" }}>
                        {formatPlayTime(totalPlayTime)}
                      </strong>
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Tabs */}
          <div
            className="flex gap-1 p-1 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <ProfileTabBtn
              active={tab === "games"}
              icon={<Gamepad2 size={14} />}
              label="Oyunlar"
              count={games.length}
              onClick={() => setTab("games")}
            />
            <ProfileTabBtn
              active={tab === "activity"}
              icon={<Activity size={14} />}
              label="Aktiviteler"
              count={activityFeed.data?.total}
              onClick={() => setTab("activity")}
            />
          </div>

          {/* Tab content */}
          {tab === "games" && games.length > 0 && (
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {games.map((game) => (
                <GameCard key={game._id} game={game} readonly />
              ))}
            </motion.div>
          )}

          {tab === "activity" && (
            <ActivityFeed
              data={activityFeed.data}
              isLoading={activityFeed.isLoading}
              isFetching={activityFeed.isFetching}
              page={activityPage}
              onPageChange={(p) => {
                setActivityPage(p);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onRefresh={() => activityFeed.refetch()}
            />
          )}
        </div>
      </PageContainer>
    </motion.div>
  );
}

function ProfileTabBtn({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-150"
      style={
        active
          ? {
              background: "rgba(168,85,247,0.2)",
              color: "#c084fc",
              border: "1px solid rgba(168,85,247,0.3)",
            }
          : { color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }
      }
    >
      {icon}
      {label}
      {count !== undefined && (
        <span
          className="ml-1 text-xs px-1.5 py-0.5 rounded-full"
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
