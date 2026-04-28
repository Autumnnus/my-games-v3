import { forwardRef } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    {
      variant = "default",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      children,
      className = "",
      disabled,
      ...props
    },
    ref,
  ) => {
    const variantClass = {
      default: "glass-btn",
      primary: "glass-btn glass-btn-primary",
      danger: "glass-btn glass-btn-danger",
      ghost: "glass-btn glass-btn-ghost",
    }[variant];

    const sizeClass = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base",
    }[size];

    return (
      <button
        ref={ref}
        className={`${variantClass} ${sizeClass} inline-flex items-center justify-center gap-2 font-medium ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <LoadingSpinner size={size === "lg" ? "md" : "sm"} />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </button>
    );
  },
);
GlassButton.displayName = "GlassButton";
