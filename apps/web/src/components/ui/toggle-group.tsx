import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { toggleVariants } from "@/components/ui/toggle"

// default/outline: tek bir iz içinde bölümlü kontrol; chips: ayrı ayrı sarılan hap düğmeler.
const toggleGroupVariants = cva("group/toggle-group flex w-fit max-w-full items-center", {
  variants: {
    variant: {
      default: "gap-0.5 rounded-[14px] bg-white/[0.05] p-1",
      outline:
        "gap-0.5 rounded-[14px] border border-white/10 bg-white/[0.04] p-[3px] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.03)]",
      chips: "flex-wrap gap-1.5",
    },
  },
  defaultVariants: { variant: "default" },
})

const toggleGroupItemVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 text-sm font-semibold whitespace-nowrap outline-none transition-[color,background-color,border-color,box-shadow,scale] duration-150 ease-(--ease-salon) focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-foreground data-[state=on]:text-background [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "rounded-[10px] text-foreground/65 not-data-[state=on]:hover:bg-white/[0.07] not-data-[state=on]:hover:text-foreground data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.3)]",
        outline:
          "rounded-[11px] text-foreground/65 not-data-[state=on]:hover:bg-white/[0.07] not-data-[state=on]:hover:text-foreground data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.3)]",
        chips:
          "rounded-full border border-white/10 bg-white/[0.03] text-foreground/80 not-data-[state=on]:hover:border-white/20 not-data-[state=on]:hover:bg-white/[0.07] not-data-[state=on]:hover:text-foreground data-[state=on]:border-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-3",
        sm: "h-7 min-w-7 px-2.5 text-[13px]",
        lg: "h-10 min-w-10 px-4",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

type GroupVariant = NonNullable<VariantProps<typeof toggleGroupVariants>["variant"]>
type GroupSize = VariantProps<typeof toggleVariants>["size"]

const ToggleGroupContext = React.createContext<{
  variant?: GroupVariant | null
  size?: GroupSize
  spacing?: number
}>({
  size: "default",
  variant: "default",
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing,
  style,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & {
  variant?: GroupVariant | null
  size?: GroupSize
  /** Öğeler arası boşluk (Tailwind aralık birimi); verilmezse varyantın boşluğu. */
  spacing?: number
}) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant ?? "default"}
      data-size={size}
      data-spacing={spacing}
      style={
        spacing === undefined ? style : { gap: `calc(var(--spacing) * ${spacing})`, ...style }
      }
      className={cn(toggleGroupVariants({ variant }), className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & {
  variant?: GroupVariant | null
  size?: GroupSize
}) {
  const context = React.useContext(ToggleGroupContext)
  const itemVariant = context.variant || variant
  const itemSize = context.size || size

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={itemVariant ?? "default"}
      data-size={itemSize}
      className={cn(toggleGroupItemVariants({ variant: itemVariant, size: itemSize }), className)}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
