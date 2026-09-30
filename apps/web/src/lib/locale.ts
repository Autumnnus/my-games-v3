import { getLocale, isLocale, type Locale, setLocale } from "@/paraglide/runtime";
import { authClient } from "./auth-client";
import { authErrorMessage } from "./auth-errors";

export const localeLabels: Record<Locale, string> = { en: "English", tr: "Türkçe" };

/** Giriş yapmadan seçilen dil; giriş yapılınca sunucu bunu hesaba yazar (`@my-games/api` › `syncLocale`). */
const PICK_COOKIE = "mg_locale_pick";

export function hasLocalePick() {
  return typeof document !== "undefined" && document.cookie.includes(`${PICK_COOKIE}=`);
}

/**
 * Arayüz dilini değiştirir ve sayfayı o dilde yeniden yükler. Oturum açıksa önce hesaba yazılır (bildirim ve
 * e-postalar da bu dilde gelir, diğer cihazlar da buna geçer); değilse giriş yapılınca hesaba yazılsın diye
 * işaretlenir. İlk ziyarette seçim yoksa dil tarayıcıdan tespit edilir (Paraglide `preferredLanguage`).
 */
export async function changeLocale(locale: Locale, options: { signedIn: boolean }) {
  if (locale === getLocale()) return;
  if (options.signedIn) {
    const { error } = await authClient.updateUser({ locale } as Parameters<
      typeof authClient.updateUser
    >[0]);
    if (error) throw new Error(authErrorMessage(error));
  } else {
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API her tarayıcıda yok; Paraglide de böyle yazar
    document.cookie = `${PICK_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }
  setLocale(locale);
}

/**
 * Giriş sonrası: hesabın dili bu cihazdakinden farklıysa ya da giriş ekranında dil seçildiyse sayfa baştan
 * yüklenmeli (dil eşitlemesi sunucuda, sayfa isteğinde yapılır). Aksi hâlde uygulama içinde gezinmek yeter.
 */
export function needsLocaleReload(accountLocale: string | null | undefined) {
  if (hasLocalePick()) return true;
  return isLocale(accountLocale) && accountLocale !== getLocale();
}
