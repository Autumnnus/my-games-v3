import { m } from "@/paraglide/messages";

/** Better Auth hata kodlarını kullanıcıya gösterilecek mesaja çevirir. */
export function authErrorMessage(error: { code?: string } | null | undefined) {
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_USERNAME_OR_PASSWORD":
      return m.error_invalid_credentials();
    case "EMAIL_NOT_VERIFIED":
      return m.error_email_not_verified();
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return m.error_user_exists();
    case "USERNAME_IS_ALREADY_TAKEN":
      return m.error_username_taken();
    case "INVALID_USERNAME":
    case "USERNAME_TOO_SHORT":
    case "USERNAME_TOO_LONG":
      return m.error_username_invalid();
    case "PASSWORD_TOO_SHORT":
      return m.error_password_short();
    case "INVALID_TOKEN":
      return m.reset_invalid();
    default:
      return m.error_generic();
  }
}
