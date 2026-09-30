import { m } from "@/paraglide/messages";
import { connectionErrorText } from "./errors";

const messages: Record<string, () => string> = {
  INVALID_EMAIL_OR_PASSWORD: m.error_invalid_credentials,
  INVALID_USERNAME_OR_PASSWORD: m.error_invalid_credentials,
  INVALID_PASSWORD: m.error_invalid_credentials,
  CREDENTIAL_ACCOUNT_NOT_FOUND: m.error_social_only,
  EMAIL_NOT_VERIFIED: m.error_email_not_verified,
  USER_ALREADY_EXISTS: m.error_user_exists,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: m.error_user_exists,
  USERNAME_IS_ALREADY_TAKEN: m.error_username_taken,
  INVALID_USERNAME: m.error_username_invalid,
  INVALID_DISPLAY_USERNAME: m.error_username_invalid,
  USERNAME_TOO_SHORT: m.error_username_invalid,
  USERNAME_TOO_LONG: m.error_username_invalid,
  PASSWORD_TOO_SHORT: m.error_password_short,
  PASSWORD_TOO_LONG: m.error_password_long,
  INVALID_EMAIL: m.error_invalid_email,
  INVALID_TOKEN: m.reset_invalid,
  TOKEN_EXPIRED: m.reset_invalid,
  BANNED_USER: m.error_banned,
  SESSION_EXPIRED: m.error_session_expired,
  SESSION_NOT_FRESH: m.error_session_expired,
  SOCIAL_ACCOUNT_ALREADY_LINKED: m.error_account_linked,
  LINKED_ACCOUNT_ALREADY_EXISTS: m.error_account_linked,
  // Turnstile (captcha eklentisi)
  VERIFICATION_FAILED: m.error_captcha,
  MISSING_RESPONSE: m.error_captcha,
  // Yönetim panelinden kayıtlar kapatıldı (auth.ts: `signups_closed`)
  SIGNUPS_CLOSED: m.sign_up_closed,
};

/**
 * Better Auth hatasını kullanıcıya gösterilecek mesaja çevirir. Bilinmeyen kodlarda HTTP durumuna, istek hiç
 * gitmediyse bağlantıya bakılır; İngilizce sunucu mesajı hiçbir zaman olduğu gibi gösterilmez.
 */
export function authErrorMessage(
  error: { code?: string; status?: number; message?: string } | null | undefined,
) {
  const byCode = error?.code ? messages[error.code] : undefined;
  if (byCode) return byCode();
  if (error?.message === "signups_closed") return m.sign_up_closed();
  if (error?.status === 429) return m.error_rate_limited();
  if (error?.status && error.status >= 500) return m.error_server();
  // better-fetch ağ hatasında status 0 döner (istek sunucuya hiç ulaşmadı).
  if (error?.status === 0) return connectionErrorText();
  return m.error_generic();
}
