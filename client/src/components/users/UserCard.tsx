import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Gamepad2, CheckCircle, Image } from "lucide-react";
import type { UserProfile } from "@/api/types";
import { Avatar } from "@/components/ui/Avatar";
import { GlassBadge } from "@/components/ui/GlassBadge";
import { fadeUp } from "@/lib/motion";

const ROLE_COLORS: Record<string, string> = {
  admin: "#ef4444",
  vip: "#f59e0b",
  user: undefined as unknown as string,
};

export function UserCard({ user }: { user: UserProfile }) {
  const roleColor = ROLE_COLORS[user.role];

  return (
    <motion.div variants={fadeUp}>
      <Link
        to="/users/$id"
        params={{ id: user._id }}
        className="glass-card glass-card-hover flex flex-col items-center gap-3 p-5 text-center"
      >
        <Avatar src={user.profileImage} name={user.name} size="lg" />
        <div>
          <p
            className="font-semibold text-sm text-text-primary"
          >
            {user.name}
          </p>
          {user.role !== "user" && (
            <GlassBadge color={roleColor} className="mt-1 capitalize">
              {user.role}
            </GlassBadge>
          )}
        </div>
        <div
          className="flex items-center gap-3 text-xs text-text-muted"
        >
          <span className="flex items-center gap-1">
            <Gamepad2 size={11} /> {user.gameSize}
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle size={11} /> {user.completedGameSize}
          </span>
          <span className="flex items-center gap-1">
            <Image size={11} /> {user.screenshotSize}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
