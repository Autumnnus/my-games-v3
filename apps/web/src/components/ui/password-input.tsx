import * as React from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import { Input, InputAction, type InputProps } from "@/components/ui/input"
import { m } from "@/paraglide/messages"

/** Göster/gizle düğmeli şifre alanı. Görünürken yazım denetimi ve otomatik büyük harf kapalı. */
function PasswordInput({ trailing, ...props }: Omit<InputProps, "type">) {
  const [visible, setVisible] = React.useState(false)
  const label = visible ? m.field_hide_password() : m.field_show_password()

  return (
    <Input
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <>
          {trailing}
          <InputAction
            aria-label={label}
            title={label}
            disabled={props.disabled}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </InputAction>
        </>
      }
    />
  )
}

export { PasswordInput }
