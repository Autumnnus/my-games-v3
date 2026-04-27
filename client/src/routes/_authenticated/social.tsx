import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Activity, Globe, User } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useActivityFeed, useUserActivity } from "@/hooks/useActivity";
import { useAuthStore } from "@/store/auth.store";
import { pageTransition } from "@/lib/motion";

export const Route = createFileRoute("/_authenticated/social")({
  component: SocialPage,
});

type Tab = "global" | "mine";

function SocialPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>("global");
  const [globalPage, setGlobalPage] = useState(1);
  const [myPage, setMyPage] = useState(1);

  const globalFeed = useActivityFeed(globalPage);
  const myFeed = useUserActivity(user?._id ?? "", myPage);

  const active = tab === "global" ? globalFeed : myFeed;
  const page = tab === "global" ? globalPage : myPage;
  const setPage = tab === "global" ? setGlobalPage : setMyPage;

  return (
    <motion.div {...pageTransition}>
      <PageContainer>
        <div className="mx-auto max-w-2xl py-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2.5 mb-1">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #a855f7, #3b82f6)",
                }}
              >
                <Activity size={16} className="text-white" />
              </div>
              <h1
                className="text-xl font-bold"
                style={{ color: "rgba(255,255,255,0.95)" }}
              >
                Sosyal Akış
              </h1>
            </div>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
              Oyun kütüphanesindeki aktiviteleri takip et
            </p>
          </div>

          {/* Tabs */}
          <div
            className="flex gap-1 p-1 rounded-xl mb-5"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <TabBtn
              active={tab === "global"}
              icon={<Globe size={14} />}
              label="Herkesi Gör"
              onClick={() => setTab("global")}
            />
            <TabBtn
              active={tab === "mine"}
              icon={<User size={14} />}
              label="Aktivitelerim"
              onClick={() => setTab("mine")}
            />
          </div>

          {/* Feed */}
          <ActivityFeed
            data={active.data}
            isLoading={active.isLoading}
            isFetching={active.isFetching}
            page={page}
            onPageChange={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onRefresh={() => active.refetch()}
          />
        </div>
      </PageContainer>
    </motion.div>
  );
}

function TabBtn({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
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
          : {
              color: "rgba(255,255,255,0.45)",
              border: "1px solid transparent",
            }
      }
    >
      {icon}
      {label}
    </button>
  );
}
