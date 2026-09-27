import { formatDate, formatRelative } from "@/lib/format";

/**
 * Sunucu ile tarayıcı saniyeler ve saat dilimi farkıyla farklı metin üretebilir (hydration uyuşmazlığı).
 * Bu bileşenler metin farkını React'e bildirir; tarayıcıdaki değer geçerli olur.
 */
export function RelativeTime({ value, className }: { value: string | Date; className?: string }) {
  const iso = new Date(value).toISOString();
  return (
    <time
      dateTime={iso}
      title={formatDate(iso, "long") ?? undefined}
      className={className}
      suppressHydrationWarning
    >
      {formatRelative(value)}
    </time>
  );
}

export function DateText({
  value,
  fallback,
}: {
  value: string | Date | null | undefined;
  fallback?: string;
}) {
  if (!value) return <>{fallback ?? null}</>;
  return (
    <time dateTime={new Date(value).toISOString()} suppressHydrationWarning>
      {formatDate(value)}
    </time>
  );
}
