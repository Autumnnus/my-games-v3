import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { GameListItem } from "@/api/types";
import { formatCoverUrl } from "@/lib/formatters";
import { StatusBadge } from "@/components/games/StatusBadge";
import { staggerContainer, fadeUp } from "@/lib/motion";

interface RecentGamesRowProps {
  games: GameListItem[];
  title: string;
}

export function RecentGamesRow({ games, title }: RecentGamesRowProps) {
  if (games.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2
          className="text-base font-semibold text-text-secondary"
        >
          {title}
        </h2>
        <Link
          to="/games"
          className="text-xs flex items-center gap-1 hover:underline text-accent"
        >
          Tümünü gör <ArrowRight size={12} />
        </Link>
      </div>
      <div className="overflow-x-auto -mx-4 px-4">
        <motion.div
          className="flex gap-3 pb-2"
          style={{ width: "max-content" }}
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {games.map((game) => {
            const cover = game.photo ? formatCoverUrl(game.photo, "big") : null;
            return (
              <motion.div
                key={game._id}
                variants={fadeUp}
                className="shrink-0 w-28"
              >
                <Link to="/games/$id" params={{ id: game._id }}>
                  <div
                    className="glass-card overflow-hidden glass-card-hover"
                    style={{ aspectRatio: "3/4" }}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt={game.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ fontSize: "1.5rem" }}
                      >
                        🎮
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 px-0.5">
                    <p
                      className="text-xs font-medium truncate text-text-secondary"
                    >
                      {game.name}
                    </p>
                    <StatusBadge
                      status={game.status}
                      className="mt-1 text-[10px]"
                    />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
