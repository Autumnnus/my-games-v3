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
            ? "rgba(168,85,247,0.6)"
            : "rgba(255,255,255,0.1)",
          border: checked
            ? "1px solid rgba(168,85,247,0.5)"
            : "1px solid rgba(255,255,255,0.15)",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span
          className="inline-block h-3.5 w-3.5 transform rounded-full"
          style={{
            background: checked ? "#ffffff" : "rgba(255,255,255,0.5)",
            transform: checked ? "translateX(18px)" : "translateX(3px)",
            transition: "transform 200ms ease",
          }}
        />
      </button>
    );
  },
);
GlassSwitch.displayName = "GlassSwitch";
