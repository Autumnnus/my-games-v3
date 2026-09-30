export const locales = ["tr", "en"] as const;
export type Locale = (typeof locales)[number];
export const baseLocale: Locale = "en";
/** Paraglide'ın dil çerezi (web tarafıyla aynı ad). */
export const LOCALE_COOKIE = "PARAGLIDE_LOCALE";
/** Giriş/kayıt ekranında dil elle seçildi: giriş yapılınca hesaba yazılır (bkz. `syncLocale`). */
export const LOCALE_PICK_COOKIE = "mg_locale_pick";

/** Web tarafındaki Paraglide ile aynı öncelik: cookie → Accept-Language → temel dil. */
export function localeFromRequest(request?: Request | null): Locale {
  if (!request) return baseLocale;

  const cookie = request.headers.get("cookie") ?? "";
  const fromCookie = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([a-z]+)`).exec(cookie)?.[1];
  if (isLocale(fromCookie)) return fromCookie;

  const accepted = request.headers.get("accept-language") ?? "";
  for (const part of accepted.split(",")) {
    const tag = part.split(";")[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(tag)) return tag;
  }
  return baseLocale;
}

export function isLocale(value: string | null | undefined): value is Locale {
  return locales.includes(value as Locale);
}
