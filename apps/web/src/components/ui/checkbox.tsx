import * as React from "react"
import { cn } from "cn"
import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer group/checkbox grid size-5 shrink-0 cursor-pointer place-content-center rounded-md border border-white/20 bg-white/[0.04] text-background shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)] outline-none transition-[background-color,border-color,box-shadow,scale] duration-150 ease-(--ease-salon)",
        "enabled:hover:border-white/35 enabled:hover:bg-white/[0.07] enabled:active:scale-90",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=indeterminate]:border-foreground data-[state=indeterminate]:bg-foreground enabled:data-[state=checked]:hover:bg-foreground/90",
        "aria-invalid:border-destructive/70 aria-invalid:ring-destructive/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current animate-in duration-150 fade-in-0 zoom-in-50"
      >
        <CheckIcon
          className="size-3.5 group-data-[state=indeterminate]/checkbox:hidden"
          strokeWidth={3.25}
        />
        <MinusIcon
          className="hidden size-3.5 group-data-[state=indeterminate]/checkbox:block"
          strokeWidth={3.25}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
