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

function Textarea({
  className,
  showCount,
  onChange,
  ...props
}: React.ComponentProps<"textarea"> & {
  /** Sağ altta karakter sayacı; `maxLength` varsa "12/500" biçiminde, sınıra yaklaşınca renklenir. */
  showCount?: boolean
}) {
  const field = useFieldControl(props)
  const [typed, setTyped] = React.useState(
    () => String(props.value ?? props.defaultValue ?? "").length
  )
  const count = props.value !== undefined ? String(props.value).length : typed
  const max = props.maxLength

  const textarea = (
    <textarea
      data-slot="textarea"
      onChange={(event) => {
        if (showCount) setTyped(event.target.value.length)
        onChange?.(event)
      }}
      {...props}
      {...field}
      className={cn(
        "flex field-sizing-content min-h-24 w-full resize-y px-3.5 py-3 leading-relaxed supports-[field-sizing:content]:resize-none",
        controlSurface,
        controlHover,
        controlFocus,
        controlInvalid,
        controlDisabled,
        controlText,
        controlAutofill,
        showCount && "pb-8",
        className
      )}
    />
  )

  if (!showCount) return textarea

  return (
    <div data-slot="textarea-group" className="relative w-full min-w-0">
      {textarea}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-3.5 bottom-2.5 text-[11px] font-medium text-foreground/35 tabular-nums transition-colors",
          max && count >= max * 0.9 && "text-amber-300/90",
          max && count >= max && "text-destructive"
        )}
      >
        {max ? `${count}/${max}` : count}
      </span>
    </div>
  )
}

export { Textarea }
