import { forwardRef, useEffect, useRef, useState } from "react";
import { Controller, type ControllerProps } from "react-hook-form";

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  label?: string;
  value?: string; // YYYY-MM-DD
  onChange?: (value: string) => void; // YYYY-MM-DD
  error?: string;
}

/**
 * Formats YYYY-MM-DD → DD.MM.YYYY for display.
 */
function toDisplay(dateValue: string | undefined): string {
  if (!dateValue || dateValue.length !== 10) return "";
  const [y, m, d] = dateValue.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Parses DD.MM.YYYY → YYYY-MM-DD for form submission.
 * Returns empty string for invalid input.
 */
function toIso(displayValue: string): string {
  const parts = displayValue.split(".");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return "";
  const paddedD = d.padStart(2, "0");
  const paddedM = m.padStart(2, "0");
  return `${y}-${paddedM}-${paddedD}`;
}

/**
 * Validates a display string (DD.MM.YYYY) in real-time.
 * Returns true if the current input is a valid day/month/year.
 */
function isValidDisplayInput(display: string): boolean {
  if (!display) return true;
  // Only allow digits and dots
  if (!/^[\d.]*$/.test(display)) return false;
  const parts = display.split(".");
  if (parts.length > 3) return false;
  // Check day
  if (parts[0] && (Number(parts[0]) < 1 || Number(parts[0]) > 31)) return false;
  // Check month
  if (parts[1] && (Number(parts[1]) < 1 || Number(parts[1]) > 12)) return false;
  // Check year
  if (parts[2] && (Number(parts[2]) < 1 || Number(parts[2]) > 9999)) return false;
  return true;
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ label, value, onChange, placeholder = "GG.AA.YYYY", error, name }, ref) => {
    // The display value shown in the text input (DD.MM.YYYY)
    const [displayValue, setDisplayValue] = useState<string>(() => toDisplay(value));
    // The hidden date input value (YYYY-MM-DD) — used for form submission
    const hiddenRef = useRef<HTMLInputElement>(null);

    // Sync when external value changes (e.g., form reset or defaultValues)
    useEffect(() => {
      setDisplayValue(toDisplay(value));
      if (hiddenRef.current && value !== undefined) {
        hiddenRef.current.value = value;
      }
    }, [value]);

    // Keep ref in sync for react-hook-form
    useEffect(() => {
      if (typeof ref === "function") {
        ref(hiddenRef.current);
      } else if (ref && "current" in ref) {
        ref.current = hiddenRef.current;
      }
    }, [ref]);

    function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
      const raw = e.target.value;
      if (!isValidDisplayInput(raw)) return;

      // Auto-format: add dots as user types
      let formatted = raw.replace(/[^0-9]/g, "");
      if (formatted.length > 0) {
        if (formatted.length <= 2) {
          // DD
          formatted = formatted;
        } else if (formatted.length <= 4) {
          // DD.MM
          formatted = `${formatted.slice(0, 2)}.${formatted.slice(2)}`;
        } else {
          // DD.MM.YYYY
          formatted = `${formatted.slice(0, 2)}.${formatted.slice(2, 4)}.${formatted.slice(4, 8)}`;
        }
      }

      setDisplayValue(formatted);

      // Sync to hidden date input and call onChange only when full date is valid
      const iso = toIso(formatted);
      if (hiddenRef.current) hiddenRef.current.value = iso;
      if (onChange) onChange(iso);
    }

    function handleDatePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
      const iso = e.target.value; // YYYY-MM-DD from native picker
      setDisplayValue(toDisplay(iso));
      if (onChange) onChange(iso);
    }

    const inputId = name ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            {label}
          </label>
        )}

        {/* Wrapper with relative positioning for layering */}
        <div className="relative">
          {/* Top layer: visible text input showing DD.MM.YYYY */}
          <input
            type="text"
            id={inputId}
            value={displayValue}
            onChange={handleTextChange}
            placeholder={placeholder}
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-white/5 border"
            style={{
              borderColor: error ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.9)",
              background: "rgba(255,255,255,0.05)",
            }}
            inputMode="numeric"
            autoComplete="off"
          />

          {/* Bottom layer: hidden date input that holds YYYY-MM-DD for forms */}
          <input
            type="date"
            ref={hiddenRef}
            name={name}
            onChange={handleDatePickerChange}
            style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none", width: "100%", height: "100%" }}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  },
);

DateInput.displayName = "DateInput";

interface DateInputFieldProps
  extends Omit<ControllerProps, "render"> {
  label?: string;
  placeholder?: string;
  error?: string;
}

/**
 * Wrapper to use DateInput inside react-hook-form Controller.
 */
export function DateInputField({
  control,
  name,
  label,
  placeholder,
  error,
  ...rest
}: DateInputFieldProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <DateInput
          label={label}
          placeholder={placeholder}
          error={error}
          name={field.name}
          value={field.value}
          onChange={field.onChange}
          ref={field.ref}
          {...rest}
        />
      )}
    />
  );
}