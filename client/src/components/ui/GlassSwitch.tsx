import * as Switch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

interface GlassSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function GlassSwitch({
  checked,
  onChange,
  disabled = false,
  className = "",
  id,
}: GlassSwitchProps) {
  return (
    <Switch.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      className={cn("glass-switch", className)}
    >
      <Switch.Thumb className="glass-switch-thumb" />
    </Switch.Root>
  );
}
