import * as Select from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface GlassSelectProps {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function GlassSelect({
  label,
  error,
  options,
  placeholder,
  value,
  onChange,
  disabled,
  className = "",
  id,
}: GlassSelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-text-secondary"
        >
          {label}
        </label>
      )}

      <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
        <Select.Trigger
          id={selectId}
          className={cn(
            "glass-input glass-select w-full px-3 py-2.5 text-sm",
            "flex items-center justify-between gap-2",
            "cursor-pointer",
            error && "glass-input-error",
            className,
          )}
        >
          <Select.Value
            placeholder={
              <span className="text-text-muted">{placeholder}</span>
            }
          />
          <Select.Icon asChild>
            <ChevronDown size={14} className="text-text-muted shrink-0" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className="glass-panel z-[200] min-w-[var(--radix-select-trigger-width)] p-1"
            position="popper"
            sideOffset={6}
          >
            <Select.Viewport>
              {options.map((opt) => (
                <Select.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className="glass-panel-item"
                >
                  <Select.ItemText>{opt.label}</Select.ItemText>
                  <Select.ItemIndicator className="ml-auto">
                    <Check size={13} className="text-accent" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
