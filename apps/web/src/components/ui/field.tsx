import { cn } from "cn";
import { CircleAlertIcon } from "lucide-react";
import {
  type AriaAttributes,
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useId,
} from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";

type FieldContextValue = {
  id: string;
  labelId: string;
  describedBy?: string;
  invalid: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

/** FormField içindeki özel kontroller (ör. seçim grupları) etiket/açıklama kimliklerini buradan alır. */
export function useField() {
  return useContext(FieldContext);
}

/**
 * Input/Textarea/SelectTrigger alanın id ve aria bağlarını buradan alır; çağıranın verdiği değer önceliklidir.
 * Böylece etiket, ipucu ve hata metni kontrolün erişilebilir adına karışmaz.
 */
export function useFieldControl(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
}) {
  const field = useContext(FieldContext);
  if (!field) {
    return {
      id: props.id,
      "aria-describedby": props["aria-describedby"],
      "aria-invalid": props["aria-invalid"],
    };
  }
  const describedBy = [props["aria-describedby"], field.describedBy].filter(Boolean).join(" ");
  return {
    id: props.id ?? field.id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}

export function FormField(props: {
  label: ReactNode;
  hint?: ReactNode;
  /** Varsa ipucunun yerine geçer ve kontrol `aria-invalid` olur. */
  error?: string | null;
  optional?: boolean;
  /** Etiket satırının sağı: sayaç, "temizle" düğmesi, "şifremi unuttum" bağlantısı gibi. */
  aside?: ReactNode;
  /** Kontrolün id'si; verilmezse üretilir. Kontrole ayrıca id verilecekse ikisi aynı olmalı. */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const id = props.id ?? generated;
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const invalid = Boolean(props.error);
  const describedBy = invalid ? errorId : props.hint ? hintId : undefined;

  return (
    <div
      data-slot="field"
      data-invalid={invalid || undefined}
      className={cn("grid min-w-0 content-start gap-2 text-sm", props.className)}
    >
      <div className="flex min-h-4 items-end justify-between gap-3">
        <Label id={labelId} htmlFor={id}>
          {props.label}
        </Label>
        {(props.optional || props.aside) && (
          <span className="text-foreground/45 flex items-center gap-2 text-xs leading-none">
            {props.optional && <span>{m.field_optional()}</span>}
            {props.aside}
          </span>
        )}
      </div>
      <FieldContext.Provider value={{ id, labelId, describedBy, invalid }}>
        {props.children}
      </FieldContext.Provider>
      {invalid ? (
        <p
          id={errorId}
          role="alert"
          className="text-destructive animate-in fade-in-0 slide-in-from-top-1 flex items-start gap-1.5 text-xs leading-snug duration-200"
        >
          <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {props.error}
        </p>
      ) : (
        props.hint && (
          <p id={hintId} className="text-foreground/50 text-xs leading-snug">
            {props.hint}
          </p>
        )
      )}
    </div>
  );
}

/** Birkaç alanı başlıkla gruplar (formu okunur bölümlere ayırmak için). */
export function FormSection(props: {
  title: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={cn("grid gap-4", props.className)}>
      <div className="flex items-center gap-3">
        <span
          id={id}
          className="text-foreground/45 shrink-0 text-[11px] font-bold tracking-[0.14em] uppercase"
        >
          {props.title}
        </span>
        <span aria-hidden className="h-px flex-1 bg-white/8" />
      </div>
      {props.children}
    </div>
  );
}

/** Açıklamalı anahtar satırı: satırın tamamı tıklanır, anahtar sağda. */
export function SwitchField({
  label,
  description,
  icon,
  className,
  id,
  ...props
}: Omit<ComponentProps<typeof Switch>, "children"> & {
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
}) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <label
      htmlFor={controlId}
      data-slot="switch-field"
      data-disabled={props.disabled || undefined}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 transition-colors duration-150 ease-(--ease-salon) select-none hover:bg-white/[0.05] has-[[data-state=checked]]:border-white/14 data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:hover:bg-white/[0.03]",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className="text-foreground/70 grid size-9 shrink-0 place-items-center rounded-[11px] bg-white/[0.06] [&_svg:not([class*='size-'])]:size-4"
        >
          {icon}
        </span>
      )}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span id={`${controlId}-label`} className="text-sm leading-snug font-semibold">
          {label}
        </span>
        {description && (
          <span id={`${controlId}-description`} className="text-foreground/55 text-xs leading-snug">
            {description}
          </span>
        )}
      </span>
      <Switch
        id={controlId}
        aria-labelledby={`${controlId}-label`}
        aria-describedby={description ? `${controlId}-description` : undefined}
        {...props}
      />
    </label>
  );
}
