import { m } from "@/paraglide/messages";
import { ApiError } from "./api";

/**
 * Sunucu hatalarının kullanıcı dilindeki karşılıkları. Sunucunun `message` alanı log içindir (Türkçe) ve
 * gösterilmez: önce sebebe (`reason`), yoksa koda, o da yoksa HTTP durumuna bakılır.
 */
const reasonMessages: Record<string, () => string> = {
  game_not_found: m.err_game_not_found,
  entry_exists: m.err_entry_exists,
  entry_not_found: m.err_entry_not_found,
  entry_gone: m.err_entry_gone,
  history_not_found: m.err_history_not_found,
  history_reverted: m.err_history_reverted,
  history_nothing_to_revert: m.err_history_nothing_to_revert,
  screenshot_link_limit: m.err_screenshot_link_limit,
  https_only: m.err_https_only,
  ai_key_duplicate: m.err_ai_key_duplicate,
  ai_key_invalid: m.err_ai_key_invalid,
  ai_key_not_found: m.err_ai_key_not_found,
  ai_key_order: m.err_ai_key_order,
  ai_key_provider: m.err_ai_key_provider,
  legacy_import_running: m.err_legacy_import_running,
  user_not_found: m.err_user_not_found,
  list_not_found: m.err_list_not_found,
  list_name_empty: m.err_list_name_empty,
  list_filter_invalid: m.err_list_filter_invalid,
  list_filter_empty: m.err_list_filter_empty,
  list_limit: m.err_list_limit,
  game_save_failed: m.err_game_save_failed,
  game_name_empty: m.err_game_name_empty,
  upload_unsupported: m.err_upload_unsupported,
  upload_too_large: m.err_upload_too_large,
  upload_batch_limit: m.err_upload_batch_limit,
  upload_expired: m.err_upload_expired,
  upload_mismatch: m.err_upload_mismatch,
  upload_confirmed: m.err_upload_confirmed,
  uploads_disabled: m.err_uploads_disabled,
  steam_disabled: m.err_steam_disabled,
  steam_unavailable: m.err_steam_unavailable,
  steam_rate_limited: m.err_steam_rate_limited,
  steam_taken: m.steam_error_steam_taken,
  steam_not_linked: m.err_steam_not_linked,
  account_taken: m.error_account_linked,
  account_not_linked: m.err_account_not_linked,
  xbox_disabled: m.err_xbox_disabled,
  xbox_state_invalid: m.err_xbox_state_invalid,
  xbox_auth_failed: m.err_xbox_auth_failed,
  xbox_no_profile: m.err_xbox_no_profile,
  xbox_unavailable: m.err_xbox_unavailable,
  push_disabled: m.err_push_disabled,
  push_invalid: m.err_push_invalid,
  report_reason_required: m.err_report_reason_required,
  content_not_found: m.err_content_not_found,
  comment_empty: m.err_comment_empty,
  comment_too_long: m.err_comment_too_long,
  comment_not_found: m.err_comment_not_found,
  ai_daily_limit: m.ai_error_quota,
  message_empty: m.err_message_empty,
  message_too_long: m.err_message_too_long,
  proposal_stale: m.err_proposal_stale,
  proposal_not_found: m.err_proposal_not_found,
  proposal_resolved: m.err_proposal_resolved,
  proposal_pick_candidate: m.err_proposal_pick_candidate,
};

const codeMessages: Record<string, () => string> = {
  not_found: m.error_not_found,
  forbidden: m.error_forbidden,
  unauthorized: m.error_unauthorized,
  banned: m.error_banned,
  conflict: m.error_conflict,
  invalid: m.error_invalid,
  unavailable: m.error_unavailable,
  rate_limited: m.error_rate_limited,
  quota_exceeded: m.error_quota,
  storage_quota: m.storage_error_quota,
  storage_full: m.storage_system_full,
  ai_blocked: m.ai_error_blocked,
  internal_error: m.error_server,
};

/** Sunucunun döndüğü kod/sebep çiftini mesaja çevirir (toplu işlem sonuçları gibi `ApiError` olmayan yerler için). */
export function apiErrorText(code: string | undefined, reason?: string, status?: number) {
  const byReason = reason ? reasonMessages[reason] : undefined;
  if (byReason) return byReason();
  const byCode = code ? codeMessages[code] : undefined;
  if (byCode) return byCode();
  if (status === 401) return m.error_unauthorized();
  if (status === 403) return m.error_forbidden();
  if (status === 404) return m.error_not_found();
  if (status === 429) return m.error_rate_limited();
  if (status && status >= 500) return m.error_server();
  return m.error_generic();
}

/** `fetch` ağ hatası: sunucuya hiç ulaşılamadı (bağlantı yok, DNS, CORS, iptal edilmemiş kopma). */
export function isNetworkError(error: unknown) {
  return (
    error instanceof TypeError && /fetch|network|load failed|connection/i.test(error.message ?? "")
  );
}

/** İstek sunucuya ulaşamadı: çevrim dışıysa bunu, değilse bağlantı sorununu söyler. */
export function connectionErrorText() {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? m.error_offline()
    : m.error_network();
}

/** Her türlü hatayı kullanıcıya gösterilecek, kendi dilinde ve ne yapacağını söyleyen bir cümleye çevirir. */
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return apiErrorText(error.code, error.reason, error.status);
  if (isNetworkError(error)) return connectionErrorText();
  return m.error_generic();
}
