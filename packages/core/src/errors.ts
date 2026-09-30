export type ErrorCode =
  | "not_found"
  | "forbidden"
  | "conflict"
  | "invalid"
  | "unavailable"
  | "rate_limited"
  | "quota_exceeded"
  /** Kullanıcının depolama kotası yetmiyor. */
  | "storage_quota"
  /** Sistemin toplam depolama bütçesi doldu. */
  | "storage_full"
  /** Admin bu hesabın AI kullanımını kapattı. */
  | "ai_blocked";

const statusByCode: Record<ErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  invalid: 400,
  unavailable: 503,
  rate_limited: 429,
  quota_exceeded: 429,
  storage_quota: 507,
  storage_full: 507,
  ai_blocked: 403,
};

/**
 * İstemciye dönen hatalar. API katmanı bunları HTTP yanıtına çevirir. `message` log ve geliştirici içindir
 * (Türkçe); kullanıcıya istemci kendi dilinde mesaj gösterir: önce `reason` (ör. "entry_exists"), yoksa `code`.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Mesajın dilden bağımsız anahtarı; istemci bunu çevirir. Aynı kodun farklı sebeplerini ayırır. */
  readonly reason: string | undefined;

  constructor(code: ErrorCode, message?: string, reason?: string) {
    super(message ?? code);
    this.code = code;
    this.status = statusByCode[code];
    this.reason = reason;
  }
}

export function notFound(message?: string, reason?: string): never {
  throw new AppError("not_found", message, reason);
}

export function forbidden(message?: string, reason?: string): never {
  throw new AppError("forbidden", message, reason);
}
