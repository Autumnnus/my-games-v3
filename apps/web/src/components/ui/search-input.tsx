import * as React from "react"
import { cn } from "cn"
import { LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react"

import { Input, InputAction, type InputProps, useComposedRef } from "@/components/ui/input"
import { m } from "@/paraglide/messages"

/**
 * Arama alanı: solda büyüteç (yüklenirken dönen halka), doluyken sağda temizle düğmesi; Esc de temizler.
 * Kontrollü ve kontrolsüz kullanımda aynı çalışır: temizleme, çağıranın `onChange`'ini boş değerle tetikler.
 */
function SearchInput({
  loading,
  onClear,
  leading,
  trailing,
  inputClassName,
  ref,
  onChange,
  onKeyDown,
  ...props
}: Omit<InputProps, "type"> & { loading?: boolean; onClear?: () => void }) {
  const [inner, composedRef] = useComposedRef(ref)
  const controlled = props.value !== undefined
  const [typedEmpty, setTypedEmpty] = React.useState(() => !props.defaultValue)
  const empty = controlled ? String(props.value).length === 0 : typedEmpty

  function clear() {
    const input = inner.current
    if (!input) return
    // React'in onChange'i tetiklensin diye değer yerel setter'la yazılıp gerçek bir input olayı gönderilir.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "")
    input.dispatchEvent(new Event("input", { bubbles: true }))
    onClear?.()
    input.focus()
  }

  return (
    <Input
      type="search"
      ref={composedRef}
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="search"
      {...props}
      onChange={(event) => {
        if (!controlled) setTypedEmpty(event.target.value.length === 0)
        onChange?.(event)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.key === "Escape" && !empty && !event.defaultPrevented) {
          event.preventDefault()
          clear()
        }
      }}
      leading={
        leading ??
        (loading ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <SearchIcon aria-hidden />)
      }
      trailing={
        (trailing || !empty) && (
          <>
            {trailing}
            {!empty && (
              <InputAction
                aria-label={m.field_clear()}
                title={m.field_clear()}
                disabled={props.disabled}
                onClick={clear}
                className="size-7 rounded-full animate-in duration-150 fade-in-0 zoom-in-75"
              >
                <XIcon className="size-3.5" strokeWidth={2.5} />
              </InputAction>
            )}
          </>
        )
      }
      inputClassName={cn(
        "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none",
        inputClassName
      )}
    />
  )
}

export { SearchInput }
