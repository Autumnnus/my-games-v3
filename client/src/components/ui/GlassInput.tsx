import { forwardRef } from "react";
import { cn } from "@/lib/cn";

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  (
    { label, error, hint, leftIcon, rightIcon, className = "", id, ...props },
    ref,
  ) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="glass-input-group flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="glass-input-label text-sm font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <div className="glass-input-shell relative flex items-center">
          {leftIcon && (
            <span className="glass-input-icon absolute left-3 flex items-center text-text-muted">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "glass-input w-full px-3 py-2.5 text-sm",
              leftIcon && "pl-9",
              rightIcon && "pr-9",
              error && "glass-input-error",
              className,
            )}
            {...props}
          />
          {rightIcon && (
            <span className="glass-input-icon absolute right-3 flex items-center text-text-muted">
              {rightIcon}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {hint && !error && (
          <p className="text-xs text-text-muted">{hint}</p>
        )}
      </div>
    );
  },
);
GlassInput.displayName = "GlassInput";
