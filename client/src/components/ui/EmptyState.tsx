import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { GlassButton } from "./GlassButton";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center gap-4 py-20 text-center"
      variants={fadeUp}
      initial="initial"
      animate="animate"
    >
      {icon && (
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center glass-card-sm mb-2"
          style={{ color: "var(--theme-text-muted)" }}
        >
          {icon}
        </div>
      )}
      <h3
        className="text-lg font-semibold"
        style={{ color: "var(--theme-text-secondary)" }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="text-sm max-w-xs"
          style={{ color: "var(--theme-text-muted)" }}
        >
          {description}
        </p>
      )}
      {action && (
        <GlassButton
          variant="primary"
          onClick={action.onClick}
          className="mt-2"
        >
          {action.label}
        </GlassButton>
      )}
    </motion.div>
  );
}
