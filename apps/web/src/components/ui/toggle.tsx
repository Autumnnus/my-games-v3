import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Toggle as TogglePrimitive } from "radix-ui"

// Açık durum sitedeki etkin çiplerle aynı: dolu, ters renk.
const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[12px] text-sm font-semibold whitespace-nowrap text-foreground/75 outline-none transition-[color,background-color,border-color,box-shadow,scale] duration-150 ease-(--ease-salon) not-data-[state=on]:hover:bg-white/[0.07] not-data-[state=on]:hover:text-foreground active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:hover:bg-foreground/90 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.03)] not-data-[state=on]:hover:border-white/[0.16] data-[state=on]:border-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-3",
        sm: "h-8 min-w-8 px-2.5 text-[13px]",
        lg: "h-11 min-w-11 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
