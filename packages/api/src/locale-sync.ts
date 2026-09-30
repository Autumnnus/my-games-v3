import { auth } from "./auth";
import { isLocale, LOCALE_COOKIE, LOCALE_PICK_COOKIE, type Locale } from "./locale";

const MAX_AGE = 400 * 24 * 60 * 60;

function readCookie(cookies: string, name: string) {
  return new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(cookies)?.[1];
}

/**
 * Sayfa (SSR) isteklerinde arayüz dilini hesapla eşitler; böylece dil ilk karede doğru gelir, sonradan sayfa
 * yenilenmez.
 * - Oturum varsa hesabın dili esastır: başka bir cihazda değiştirildiyse bu cihazın çerezi de ona geçer.
 * - Giriş/kayıt ekranında dil elle seçildiyse (işaret çerezi) seçim önce hesaba yazılır, sonra işaret silinir.
 * - Oturum yoksa bir şey yapılmaz: Paraglide çerezi, o da yoksa tarayıcı dilini kullanır.
 * `locale` doluysa SSR bu dille çizilmeli (istek çerezi eski dili taşıyor); `setCookies` yanıta eklenir.
 * İstek kopyalanmaz: sunucunun istek nesnesi (srvx) `new Request(request, …)` ile kopyalanınca SSR çöküyordu.
 */
export async function syncLocale(
  request: Request,
): Promise<{ locale?: Locale; setCookies: string[] }> {
  const unchanged = { setCookies: [] as string[] };
  if (request.method !== "GET" || !request.headers.get("accept")?.includes("text/html")) {
    return unchanged;
  }
  const cookies = request.headers.get("cookie") ?? "";
  // Oturum çerezi yoksa auth'a hiç gidilmez (ziyaretçiler, botlar).
  if (!cookies.includes("session_token=")) return unchanged;

  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return unchanged;

  const current = readCookie(cookies, LOCALE_COOKIE);
  const account = session.user.locale;
  const setCookies: string[] = [];

  if (readCookie(cookies, LOCALE_PICK_COOKIE)) {
    setCookies.push(`${LOCALE_PICK_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
    if (isLocale(current) && current !== account) {
      // Auth üzerinden yazılır ki oturum önbelleği (çerez) de tazelensin; yoksa beş dakika eski dil geri gelirdi.
      const result = await auth.api
        .updateUser({ headers: request.headers, body: { locale: current }, returnHeaders: true })
        .catch(() => null);
      for (const cookie of result?.headers.getSetCookie() ?? []) setCookies.push(cookie);
    }
    return { setCookies };
  }

  if (!isLocale(account) || account === current) return { setCookies };
  setCookies.push(`${LOCALE_COOKIE}=${account}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`);
  return { locale: account, setCookies };
}
