import * as React from "react"
import { cn } from "cn"
import { Switch as SwitchPrimitive } from "radix-ui"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 outline-none transition-[background-color,box-shadow] duration-200 ease-(--ease-salon)",
        "data-[size=default]:h-6 data-[size=default]:w-10 data-[size=sm]:h-5 data-[size=sm]:w-8",
        "data-[state=unchecked]:bg-white/[0.12] data-[state=unchecked]:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] enabled:data-[state=unchecked]:hover:bg-white/[0.18]",
        "data-[state=checked]:bg-foreground enabled:data-[state=checked]:hover:bg-foreground/90",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:ring-2 aria-invalid:ring-destructive/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.2)] transition-[translate,width,background-color] duration-200 ease-(--ease-salon)",
          "data-[state=unchecked]:bg-foreground/90 data-[state=checked]:bg-background",
          "group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-4",
          "data-[state=unchecked]:translate-x-0 group-data-[size=default]/switch:data-[state=checked]:translate-x-4 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3",
          // Basılıyken başparmak hafifçe uzar; açıkken sola doğru, kenarı yerinde kalsın.
          "group-active/switch:group-data-[size=default]/switch:w-6 group-active/switch:group-data-[size=default]/switch:data-[state=checked]:translate-x-3",
          "group-active/switch:group-data-[size=sm]/switch:w-5 group-active/switch:group-data-[size=sm]/switch:data-[state=checked]:translate-x-2"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
