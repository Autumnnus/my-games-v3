import { forwardRef } from "react";

interface GlassSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const GlassSwitch = forwardRef<HTMLButtonElement, GlassSwitchProps>(
  ({ checked, onChange, disabled = false, className = "" }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${className}`}
        style={{
          background: checked
            ? "var(--theme-accent-strong)"
            : "var(--theme-glass-surface)",
          border: checked
            ? "1px solid var(--theme-glass-border-hover)"
            : "1px solid var(--theme-glass-border)",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span
          className="inline-block h-3.5 w-3.5 transform rounded-full"
          style={{
            background: checked ? "#ffffff" : "var(--theme-text-muted)",
            transform: checked ? "translateX(18px)" : "translateX(3px)",
            transition: "transform 200ms ease",
          }}
        />
      </button>
    );
  },
);
GlassSwitch.displayName = "GlassSwitch";
