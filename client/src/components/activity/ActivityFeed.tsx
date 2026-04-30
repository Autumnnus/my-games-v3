import { GlassButton } from "@/components/ui/GlassButton";
import type { ActivityFeedResponse } from "@my-games/shared";
import { motion } from "framer-motion";
import { Activity, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityItem } from "./ActivityItem";
import type { ActivityFilter } from "./activityConfig";

const FILTER_OPTION_KEYS: { labelKey: string; value: ActivityFilter }[] = [
  { labelKey: "activity.all", value: "all" },
  { labelKey: "activity.added", value: "game_added" },
  { labelKey: "activity.completed", value: "game_completed" },
  { labelKey: "activity.dropped", value: "game_abandoned" },
  { labelKey: "activity.rated", value: "game_rated" },
  { labelKey: "activity.reviewed", value: "game_reviewed" },
  { labelKey: "activity.screenshot", value: "screenshot_added" },
  { labelKey: "activity.steamSync", value: "steam_synced" },
  { labelKey: "activity.milestone", value: "milestone_playtime" },
];

interface Props {
  data: ActivityFeedResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function ActivityFeed({
  data,
  isLoading,
  isFetching,
  page,
  onPageChange,
  onRefresh,
}: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ActivityFilter>("all");

  const items = data?.items ?? [];
  const filtered =
    filter === "all" ? items : items.filter((a) => a.type === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTION_KEYS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150"
            style={
              filter === opt.value
                ? {
                    background: "var(--theme-accent-soft)",
                    borderColor: "var(--theme-accent-soft)",
                    color: "var(--theme-accent)",
                  }
                : {
                    background: "var(--theme-surface-subtle)",
                    borderColor: "var(--theme-glass-border)",
                    color: "var(--theme-text-muted)",
                  }
            }
          >
            {t(opt.labelKey)}
          </button>
        ))}

        <button
          onClick={onRefresh}
          disabled={isFetching}
          className="ml-auto px-3 py-1 rounded-full text-xs border flex items-center gap-1.5 transition-all"
          style={{
            background: "var(--theme-surface-subtle)",
            borderColor: "var(--theme-glass-border)",
            color: "var(--theme-text-muted)",
          }}
        >
          <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} />
          {t("translation:activity.refresh")}
        </button>
      </div>

      {/* Items */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <ActivitySkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyFeed filter={filter} />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((activity, i) => (
            <ActivityItem key={activity._id} activity={activity} index={i} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <GlassButton
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft size={14} />
          </GlassButton>
          <span className="text-sm text-text-muted">
            {page} / {data.totalPages}
          </span>
          <GlassButton
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= data.totalPages}
          >
            <ChevronRight size={14} />
          </GlassButton>
        </div>
      )}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex gap-3 p-4 rounded-xl border border-glass-border bg-glass-surface">
      <div className="w-7 h-7 rounded-full bg-glass-surface-hover animate-pulse shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-4 w-2/3 rounded bg-glass-surface-hover animate-pulse" />
        <div className="h-3 w-1/4 rounded bg-glass-surface-hover animate-pulse" />
      </div>
    </div>
  );
}

function EmptyFeed({ filter }: { filter: ActivityFilter }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-3 py-16"
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{
          background: "var(--theme-surface-subtle)",
          border: "1px solid var(--theme-glass-border)",
        }}
      >
        <Activity size={20} className="text-text-muted" />
      </div>
      <p className="text-sm text-text-muted">
        {filter === "all"
          ? t("translation:activity.noActivity")
          : t("translation:activity.noActivityFiltered")}
      </p>
    </motion.div>
  );
}
