import { motion } from "framer-motion";
import { Gamepad2, Trophy, Clock, Star } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatPlayTime, formatRating } from "@/lib/formatters";
import { staggerContainer, fadeUp } from "@/lib/motion";
import type { AuthTokenResponse } from "@my-games/shared";

interface StatsSummaryRowProps {
  user: AuthTokenResponse["user"];
  totalPlayTime?: number;
  avgRating?: number;
}

export function StatsSummaryRow({
  user,
  totalPlayTime = 0,
  avgRating,
}: StatsSummaryRowProps) {
  const stats = [
    {
      icon: Gamepad2,
      label: "Toplam Oyun",
      value: user.gameSize,
      color: "#a855f7",
    },
    {
      icon: Trophy,
      label: "Tamamlanan",
      value: user.completedGameSize,
      color: "#22c55e",
    },
    {
      icon: Clock,
      label: "Toplam Süre",
      value: formatPlayTime(totalPlayTime),
      color: "#3b82f6",
    },
    {
      icon: Star,
      label: "Ort. Puan",
      value: avgRating ? formatRating(avgRating) : "—",
      color: "#f59e0b",
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {stats.map(({ icon: Icon, label, value, color }) => (
        <motion.div key={label} variants={fadeUp}>
          <GlassCard className="p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: `${color}22`,
                  border: `1px solid ${color}33`,
                }}
              >
                <Icon size={16} style={{ color }} />
              </div>
              <span
                className="text-xs"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                {label}
              </span>
            </div>
            <span
              className="text-2xl font-bold"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              {value}
            </span>
          </GlassCard>
        </motion.div>
      ))}
    </motion.div>
  );
}
