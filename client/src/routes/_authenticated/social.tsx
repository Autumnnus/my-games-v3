import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { PageContainer } from "@/components/layout/PageContainer";
import { useActivityFeed, useUserActivity } from "@/hooks/useActivity";
import { pageTransition } from "@/lib/motion";
import { useAuthStore } from "@/store/auth.store";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Activity, Globe, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/social")({
  component: SocialPage,
});

type Tab = "global" | "mine";

function SocialPage() {
  const { t } = useTranslation();
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
                  background:
                    "linear-gradient(135deg, var(--theme-accent), var(--theme-accent-2))",
                }}
              >
                <Activity size={16} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-text-primary">
                {t("translation:social.title")}
              </h1>
            </div>
            <p className="text-sm text-text-muted">
              {t("translation:social.subtitle")}
            </p>
          </div>

          {/* Tabs */}
          <div
            className="flex gap-1 p-1 rounded-xl mb-5"
            style={{
              background: "var(--theme-surface-subtle)",
              border: "1px solid var(--theme-glass-border)",
            }}
          >
            <TabBtn
              active={tab === "global"}
              icon={<Globe size={14} />}
              label={t("translation:pages.social.showAll")}
              onClick={() => setTab("global")}
            />
            <TabBtn
              active={tab === "mine"}
              icon={<User size={14} />}
              label={t("translation:pages.social.myActivities")}
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
              background: "var(--theme-accent-soft)",
              color: "var(--theme-accent)",
              border: "1px solid var(--theme-accent-soft)",
            }
          : {
              color: "var(--theme-text-muted)",
              border: "1px solid transparent",
            }
      }
    >
      {icon}
      {label}
    </button>
  );
}
