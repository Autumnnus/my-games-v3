import { m } from "@/paraglide/messages";

/** Steam OpenID akışını başlatır; Better Auth plugin'i Steam'in giriş sayfasına yönlendirecek URL'i döner. */
export async function startSteamSignIn(options: { callbackURL: string; link?: boolean }) {
  const response = await fetch("/api/auth/sign-in/steam", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!response.ok) throw new Error(m.steam_error_steam_invalid());
  const { url } = (await response.json()) as { url: string };
  window.location.href = url;
}

const steamErrors: Record<string, () => string> = {
  steam_taken: m.steam_error_steam_taken,
  steam_invalid: m.steam_error_steam_invalid,
  steam_cancelled: m.steam_error_steam_cancelled,
  steam_state: m.steam_error_steam_state,
};

export function steamErrorMessage(code: string | undefined) {
  return code ? (steamErrors[code]?.() ?? null) : null;
}
