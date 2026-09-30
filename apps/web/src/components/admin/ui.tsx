import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { avatarThumb } from "@/lib/media/urls";
import { m } from "@/paraglide/messages";

/** Başlıklı bölüm kartı. */
export function Panel({
  title,
  description,
  actions,
  children,
  tone = "default",
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <section
      className={`grid min-w-0 content-start gap-4 rounded-[22px] border p-5 ${
        tone === "danger" ? "border-destructive/35 bg-destructive/[0.04]" : "bg-card border-white/8"
      } ${className}`}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-0.5">
            {title && <h2 className="m-0 text-[15px] font-bold">{title}</h2>}
            {description && <p className="text-foreground/60 m-0 text-xs">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Tek sayı: etiket, değer, isteğe bağlı alt satır. Büyük sayılar orantılı rakamla (tabular değil). */
export function Kpi({
  label,
  value,
  hint,
  to,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  to?: string;
  tone?: "warn" | "danger" | "ok";
}) {
  const accent =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-200"
        : tone === "ok"
          ? "text-live"
          : "";
  const body = (
    <>
      <span className="text-foreground/60 text-[13px]">{label}</span>
      <span className={`text-[26px] leading-tight font-semibold ${accent}`}>{value}</span>
      {hint && <span className="text-foreground/55 text-xs">{hint}</span>}
    </>
  );
  const className =
    "bg-card grid min-w-0 content-start gap-1 rounded-[20px] border border-white/8 p-4";
  return to ? (
    <Link to={to} className={`${className} transition-colors hover:bg-white/[0.06]`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Doluluk çubuğu: dolu kısım şiddeti taşır (mavi → amber → kırmızı), iz aynı rengin açık tonu. */
export function Meter({
  value,
  max,
  label,
}: {
  value: number;
  max: number | null;
  label?: string;
}) {
  const ratio = max && max > 0 ? Math.min(1, value / max) : 0;
  const color = ratio >= 0.95 ? "bg-destructive" : ratio >= 0.8 ? "bg-amber-300" : "bg-[#7ea7e6]";
  const track =
    ratio >= 0.95 ? "bg-destructive/15" : ratio >= 0.8 ? "bg-amber-300/15" : "bg-[#7ea7e6]/15";
  return (
    // biome-ignore lint/a11y/useSemanticElements: yerel <meter> tarayıcılar arasında tutarlı biçimlendirilemiyor
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max ?? 0}
      aria-valuenow={value}
      aria-label={label}
      className={`h-2 overflow-hidden rounded-full ${track}`}
    >
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${max ? Math.max(ratio > 0 ? 2 : 0, ratio * 100) : 0}%` }}
      />
    </div>
  );
}

const pillTones = {
  ok: "bg-live/15 text-live",
  warn: "bg-amber-300/15 text-amber-200",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-[#7ea7e6]/15 text-[#a9c4ee]",
  muted: "bg-white/8 text-foreground/70",
} as const;

export function Pill({
  tone = "muted",
  children,
  className = "",
}: {
  tone?: keyof typeof pillTones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-bold whitespace-nowrap ${pillTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

type PersonLike = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
} | null;

/** Avatar + ad + @kullanıcı; kişinin yönetim sayfasına bağlanır. Silinmiş kullanıcı için yer tutucu. */
export function Person({
  user,
  sub,
  size = "sm",
}: {
  user: PersonLike;
  sub?: ReactNode;
  size?: "sm" | "md";
}) {
  if (!user) {
    return <span className="text-foreground/50 text-sm italic">{m.admin_deleted_user()}</span>;
  }
  const avatar = size === "md" ? "size-9" : "size-7";
  return (
    <Link
      to="/admin/users/$id"
      params={{ id: user.id }}
      className="group flex min-w-0 items-center gap-2.5"
    >
      <Avatar className={`${avatar} shrink-0`}>
        {user.image && <AvatarImage src={avatarThumb(user.image)} alt="" />}
        <AvatarFallback className="text-xs">
          {(user.name ?? "?").charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="grid min-w-0 leading-tight">
        <span className="truncate text-[13px] font-semibold group-hover:underline">
          {user.name ?? m.admin_deleted_user()}
        </span>
        <span className="text-foreground/55 truncate text-xs">
          {user.username ? `@${user.username}` : ""}
          {sub}
        </span>
      </span>
    </Link>
  );
}

/** JSON içerik (araç girdisi/çıktısı, log bağlamı). React metni kaçışlar; HTML olarak yorumlanmaz. */
export function JsonView({
  label,
  value,
  defaultOpen = false,
}: {
  label: ReactNode;
  value: unknown;
  defaultOpen?: boolean;
}) {
  const text = (() => {
    try {
      const full = JSON.stringify(value, null, 2) ?? String(value);
      return full.length > 20_000 ? `${full.slice(0, 20_000)}\n… (${full.length - 20_000})` : full;
    } catch {
      return String(value);
    }
  })();
  return (
    <details open={defaultOpen} className="group rounded-xl bg-black/25">
      <summary className="text-foreground/70 hover:text-foreground flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-semibold select-none">
        <ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" />
        {label}
      </summary>
      <pre className="text-foreground/85 m-0 max-h-[420px] overflow-auto px-3 pb-3 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap">
        {text}
      </pre>
    </details>
  );
}

/** Tek seçimli filtre düğmeleri (bir satırda, grafiklerin/listelerin üstünde). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <fieldset className="m-0 flex w-fit max-w-full flex-wrap gap-1 rounded-full border-0 bg-white/5 p-1">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
            option.value === value
              ? "bg-foreground text-background"
              : "text-foreground/70 hover:text-foreground hover:bg-white/8"
          }`}
        >
          {option.label}
          {option.count !== undefined && option.count > 0 && (
            <span className="ml-1.5 tabular-nums opacity-70">{option.count}</span>
          )}
        </button>
      ))}
    </fieldset>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-foreground/55 m-0 py-6 text-center text-sm">{children}</p>;
}

/** Tanım listesi satırı. */
export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm [&:not(:last-child)]:border-b [&:not(:last-child)]:border-white/6">
      <dt className="text-foreground/60 shrink-0">{label}</dt>
      <dd className="m-0 min-w-0 text-right break-words tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * Geri alınamayan işlemler için onay: kullanıcı adını aynen yazmadan düğme açılmaz. Sunucu da aynı metni
 * doğrular (istemci atlansa bile).
 */
export function TypedConfirm({
  open,
  onOpenChange,
  title,
  description,
  expected,
  confirmLabel,
  pending,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  expected: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: (typed: string) => void;
  children?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const id = useId();
  const matches =
    typed.trim().replace(/^@/, "").toLowerCase() === expected.replace(/^@/, "").toLowerCase();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <label htmlFor={id} className="grid gap-2 text-sm">
          <span>
            {m.admin_confirm_type()} <strong className="font-mono">{expected}</strong>
          </span>
          <Input
            id={id}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {m.admin_cancel()}
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || pending}
            onClick={() => onConfirm(typed.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
