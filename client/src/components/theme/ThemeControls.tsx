import { Moon, Monitor, Palette, Sun } from "lucide-react";
import { GlassSwitch } from "@/components/ui/GlassSwitch";
import { useUIStore, type ThemeMode } from "@/store/ui.store";

const MODES: Array<{
  value: ThemeMode;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "Sistem", icon: Monitor },
];

export function ThemeControls() {
  const themeMode = useUIStore((s) => s.themeMode);
  const setThemeMode = useUIStore((s) => s.setThemeMode);
  const dynamicThemeEnabled = useUIStore((s) => s.dynamicThemeEnabled);
  const setDynamicThemeEnabled = useUIStore((s) => s.setDynamicThemeEnabled);

  return (
    <div className="px-2 py-2">
      <div className="flex items-center justify-between gap-3 px-1 pb-2">
        <span
          className="flex items-center gap-2 text-xs font-medium text-text-secondary"
        >
          <Palette size={14} />
          Tema
        </span>
        <GlassSwitch
          checked={dynamicThemeEnabled}
          onChange={setDynamicThemeEnabled}
        />
      </div>
      <div
        className="grid grid-cols-3 gap-1 rounded-xl p-1"
        style={{
          background: "var(--theme-glass-surface)",
          border: "1px solid var(--theme-glass-border)",
        }}
      >
        {MODES.map(({ value, label, icon: Icon }) => {
          const active = themeMode === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setThemeMode(value)}
              className="flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] transition-colors"
              style={{
                background: active ? "var(--theme-accent-soft)" : "transparent",
                color: active
                  ? "var(--theme-accent)"
                  : "var(--theme-text-muted)",
              }}
              aria-label={`${label} tema`}
              title={`${label} tema`}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
