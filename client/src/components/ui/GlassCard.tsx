import { forwardRef } from "react";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  size?: "sm" | "md";
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className = "", hover = false, size = "md", children, ...props }, ref) => {
    const base = size === "sm" ? "glass-card-sm" : "glass-card";
    const hoverClass = hover ? "glass-card-hover" : "";
    return (
      <div
        ref={ref}
        className={`${base} ${hoverClass} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);
GlassCard.displayName = "GlassCard";
