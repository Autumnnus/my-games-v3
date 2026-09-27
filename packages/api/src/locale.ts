export const locales = ["tr", "en"] as const;
export type Locale = (typeof locales)[number];
export const baseLocale: Locale = "en";

/** Web tarafındaki Paraglide ile aynı öncelik: cookie → Accept-Language → temel dil. */
export function localeFromRequest(request?: Request | null): Locale {
  if (!request) return baseLocale;

  const cookie = request.headers.get("cookie") ?? "";
  const fromCookie = /(?:^|;\s*)PARAGLIDE_LOCALE=([a-z]+)/.exec(cookie)?.[1];
  if (isLocale(fromCookie)) return fromCookie;

  const accepted = request.headers.get("accept-language") ?? "";
  for (const part of accepted.split(",")) {
    const tag = part.split(";")[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(tag)) return tag;
  }
  return baseLocale;
}

function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}
