import { cn } from "cn";
import { useState } from "react";
import { toast } from "sonner";
import { changeLocale, localeLabels } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { getLocale, type Locale, locales } from "@/paraglide/runtime";

/**
 * Dil seçimi (ayarlar ve giriş/kayıt ekranı). Seçim sayfayı o dilde yeniden yükler; oturum açıksa hesaba da
 * yazılır, açık değilse giriş yapılınca yazılır.
 */
export function LanguagePicker({ signedIn, className }: { signedIn: boolean; className?: string }) {
  const [pending, setPending] = useState<Locale | null>(null);
  const current = pending ?? getLocale();

  async function pick(locale: Locale) {
    if (locale === getLocale() || pending) return;
    setPending(locale);
    try {
      await changeLocale(locale, { signedIn });
    } catch (error) {
      setPending(null);
      toast.error(error instanceof Error ? error.message : m.error_generic());
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={m.language()}
      className={cn(
        "inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1",
        className,
      )}
    >
      {locales.map((locale) => {
        const active = current === locale;
        return (
          // biome-ignore lint/a11y/useSemanticElements: iki seçenekli hap düğmesi; native radio bu görünümü vermiyor
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={active}
            lang={locale}
            disabled={!!pending}
            onClick={() => void pick(locale)}
            className={cn(
              "h-9 rounded-full px-4 text-sm font-semibold transition-colors duration-200 disabled:cursor-default",
              active
                ? "bg-foreground text-background shadow-sm"
                : "text-foreground/70 hover:bg-white/8 hover:text-foreground",
            )}
          >
            {localeLabels[locale]}
          </button>
        );
      })}
    </div>
  );
}
