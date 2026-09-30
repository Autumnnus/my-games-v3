import * as React from "react"
import { cn } from "cn"

import {
  controlAutofill,
  controlDisabled,
  controlFocus,
  controlHover,
  controlInvalid,
  controlSurface,
  controlText,
} from "@/components/ui/control"
import { useFieldControl } from "@/components/ui/field"

type InputProps = React.ComponentProps<"input"> & {
  /** Solda simge/önek (tıklanmaz, tıklama input'a gider). */
  leading?: React.ReactNode
  /** Sağda birim, düğme vb. Verilince `className` dış kabı, `inputClassName` iç input'u biçimler. */
  trailing?: React.ReactNode
  inputClassName?: string
}

/** Kendi ref'ini tutup dışarıdan gelen ref'e de iletir (şifre/arama bileşenleri input'a erişir). */
function useComposedRef<T>(ref: React.Ref<T> | undefined) {
  const inner = React.useRef<T | null>(null)
  const composed = React.useCallback(
    (node: T | null) => {
      inner.current = node
      if (typeof ref === "function") return ref(node)
      if (ref) ref.current = node
    },
    [ref]
  )
  return [inner, composed] as const
}

// Sayı oklarını gizler (klavye okları çalışır), tarih seçici simgesini koyu temaya uydurur.
const nativeParts =
  "[&[type=number]]:[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:rounded [&::-webkit-calendar-picker-indicator]:opacity-45 [&::-webkit-calendar-picker-indicator]:transition-opacity hover:[&::-webkit-calendar-picker-indicator]:opacity-85 [&::-webkit-date-and-time-value]:text-left file:mr-3 file:inline-flex file:h-7 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:text-[13px] file:font-semibold file:text-foreground"

function Input({
  className,
  inputClassName,
  type,
  leading,
  trailing,
  ref,
  ...props
}: InputProps) {
  const field = useFieldControl(props)
  const [inner, composedRef] = useComposedRef(ref)

  if (!leading && !trailing) {
    return (
      <input
        type={type}
        data-slot="input"
        ref={ref}
        {...props}
        {...field}
        className={cn(
          "h-11 w-full min-w-0 px-3.5 py-0",
          controlSurface,
          controlHover,
          controlFocus,
          controlInvalid,
          controlDisabled,
          controlText,
          controlAutofill,
          nativeParts,
          className,
          inputClassName
        )}
      />
    )
  }

  return (
    // Kenar ve odak halkası kapta; input şeffaf. Boşluğa/simgeye tıklamak input'a odaklar.
    <div
      data-slot="input-group"
      data-disabled={props.disabled || undefined}
      className={cn(
        "flex h-11 w-full min-w-0 items-center",
        controlSurface,
        "hover:border-white/[0.16] hover:bg-white/[0.05]",
        "has-[input:focus-visible]:border-white/30 has-[input:focus-visible]:bg-white/[0.06] has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-white/[0.08]",
        "has-[input[aria-invalid=true]]:border-destructive/60 has-[input[aria-invalid=true]:focus-visible]:border-destructive/80 has-[input[aria-invalid=true]:focus-visible]:ring-destructive/15",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:border-white/10 data-disabled:hover:bg-white/[0.04]",
        className
      )}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement
        if (target.closest("button, a, input, select, textarea, [role=button]")) return
        event.preventDefault()
        inner.current?.focus()
      }}
    >
      {leading && (
        <span
          data-slot="input-leading"
          className="flex shrink-0 items-center pl-3.5 text-foreground/45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          {leading}
        </span>
      )}
      <input
        type={type}
        data-slot="input"
        ref={composedRef}
        {...props}
        {...field}
        className={cn(
          "h-full w-full min-w-0 flex-1 rounded-[inherit] bg-transparent px-3.5 py-0 text-foreground outline-none disabled:cursor-not-allowed",
          leading && "pl-2.5",
          trailing && "pr-2",
          controlText,
          controlAutofill,
          nativeParts,
          inputClassName
        )}
      />
      {trailing && (
        <span
          data-slot="input-trailing"
          className="flex shrink-0 items-center gap-1 pr-3 text-[13px] text-foreground/50 has-[button]:pr-1.5 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          {trailing}
        </span>
      )}
    </div>
  )
}

/** Input'un sağındaki küçük simge düğmesi (göster/gizle, temizle). Odak input'ta kalır. */
function InputAction({ className, onMouseDown, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="input-action"
      onMouseDown={(event) => {
        event.preventDefault()
        onMouseDown?.(event)
      }}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-[10px] text-foreground/50 transition-colors duration-150 outline-none hover:bg-white/[0.08] hover:text-foreground focus-visible:bg-white/[0.08] focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

export { Input, InputAction, useComposedRef, type InputProps }
