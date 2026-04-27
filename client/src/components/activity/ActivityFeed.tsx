import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Activity, RefreshCw } from "lucide-react";
import type { ActivityFeedResponse, ActivityType } from "@my-games/shared";
import { GlassButton } from "@/components/ui/GlassButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { ActivityItem } from "./ActivityItem";
import { FILTER_OPTIONS, type ActivityFilter } from "./activityConfig";

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
  const [filter, setFilter] = useState<ActivityFilter>("all");

  const items = data?.items ?? [];
  const filtered =
    filter === "all" ? items : items.filter((a) => a.type === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150"
            style={
              filter === opt.value
                ? {
                    background: "rgba(168,85,247,0.2)",
                    borderColor: "rgba(168,85,247,0.5)",
                    color: "#c084fc",
                  }
                : {
                    background: "rgba(255,255,255,0.04)",
                    borderColor: "rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.5)",
                  }
            }
          >
            {opt.label}
          </button>
        ))}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isFetching}
          className="ml-auto px-3 py-1 rounded-full text-xs border flex items-center gap-1.5 transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            borderColor: "rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} />
          Yenile
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
          <span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
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
    <div className="flex gap-3 p-4 rounded-xl border border-white/[0.07] bg-white/[0.03]">
      <div className="w-7 h-7 rounded-full bg-white/10 animate-pulse shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-4 w-2/3 rounded bg-white/10 animate-pulse" />
        <div className="h-3 w-1/4 rounded bg-white/10 animate-pulse" />
      </div>
    </div>
  );
}

function EmptyFeed({ filter }: { filter: ActivityFilter }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-3 py-16"
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Activity size={20} style={{ color: "rgba(255,255,255,0.3)" }} />
      </div>
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
        {filter === "all" ? "Henüz aktivite yok." : "Bu filtrede aktivite yok."}
      </p>
    </motion.div>
  );
}
