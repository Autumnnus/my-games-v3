import { cn } from "@/lib/cn";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Controller, type ControllerProps } from "react-hook-form";
import { useTranslation } from "react-i18next";

// ─── Date helpers ────────────────────────────────────────────────────────────

function isoToDate(iso: string | undefined): Date | undefined {
  if (!iso || iso.length !== 10) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? undefined : date;
}

function dateToIso(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDisplay(iso: string | undefined, locale: string): string {
  const date = isoToDate(iso);
  if (!date) return "";
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

// ─── Calendar ────────────────────────────────────────────────────────────────

interface CalendarProps {
  selected: Date | undefined;
  onSelect: (date: Date) => void;
  locale: string;
}

function Calendar({ selected, onSelect, locale }: CalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(
    selected?.getFullYear() ?? today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    selected?.getMonth() ?? today.getMonth(),
  );

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDayOfWeek(viewYear, viewMonth);
  const daysInPrev = getDaysInMonth(viewYear, viewMonth - 1);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    locale,
    {
      month: "long",
      year: "numeric",
    },
  );

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, i + 1)
      .toLocaleDateString(locale, { weekday: "short" })
      .slice(0, 2),
  );

  function prev() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  }

  function next() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  }

  function isSelected(d: number) {
    return (
      selected?.getFullYear() === viewYear &&
      selected?.getMonth() === viewMonth &&
      selected?.getDate() === d
    );
  }

  function isToday(d: number) {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === d
    );
  }

  // Build cell grid: prev-month trailing + current + next-month leading
  const cells: { day: number; current: boolean }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, current: false });
  }

  return (
    <div className="flex flex-col gap-3 select-none" style={{ width: 264 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={prev}
          className="glass-btn p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-semibold text-text-primary capitalize">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={next}
          className="glass-btn p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7">
        {weekdays.map((wd) => (
          <div
            key={wd}
            className="text-center text-[11px] font-medium text-text-muted py-1"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((cell, idx) => {
          const sel = cell.current && isSelected(cell.day);
          const tod = cell.current && isToday(cell.day);
          return (
            <button
              key={idx}
              type="button"
              disabled={!cell.current}
              onClick={() =>
                cell.current &&
                onSelect(new Date(viewYear, viewMonth, cell.day))
              }
              className={cn(
                "h-8 w-full rounded-lg text-sm transition-all",
                !cell.current && "opacity-20 pointer-events-none",
                cell.current &&
                  !sel &&
                  "text-text-secondary hover:bg-glass-surface-hover hover:text-text-primary",
                tod && !sel && "text-accent font-semibold",
                sel && "bg-accent text-white font-semibold hover:bg-accent",
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── DateInput ───────────────────────────────────────────────────────────────

interface DateInputProps {
  label?: string;
  value?: string; // YYYY-MM-DD
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  name?: string;
  disabled?: boolean;
}

export function DateInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  name,
  disabled,
}: DateInputProps) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);

  const locale = i18n.language === "tr" ? "tr-TR" : "en-US";
  const selected = isoToDate(value);
  const inputId = name ?? label?.toLowerCase().replace(/\s+/g, "-");

  function handleSelect(date: Date) {
    onChange?.(dateToIso(date));
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange?.("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-text-secondary"
        >
          {label}
        </label>
      )}

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            id={inputId}
            type="button"
            disabled={disabled}
            className={cn(
              "glass-input w-full px-3 py-2.5 text-sm flex items-center gap-2 text-left",
              error && "glass-input-error",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <CalendarDays size={14} className="text-text-muted shrink-0" />
            <span
              className={cn(
                "flex-1 truncate",
                selected ? "text-text-primary" : "text-text-muted",
              )}
            >
              {formatDisplay(value, locale) ||
                placeholder ||
                t("translation:common.datePicker.placeholder")}
            </span>
            {selected && !disabled && (
              <span
                role="button"
                aria-label={t("translation:common.datePicker.clear")}
                onClick={handleClear}
                className="text-text-muted hover:text-text-secondary transition-colors shrink-0"
              >
                <X size={13} />
              </span>
            )}
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            align="start"
            className="z-[300] glass-panel p-3 rounded-2xl"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Calendar
              selected={selected}
              onSelect={handleSelect}
              locale={locale}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ─── react-hook-form wrapper ─────────────────────────────────────────────────

interface DateInputFieldProps extends Omit<ControllerProps, "render"> {
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export function DateInputField({
  control,
  name,
  label,
  placeholder,
  error,
  disabled,
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
          disabled={disabled}
        />
      )}
    />
  );
}
