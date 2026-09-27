export type ErrorCode =
  | "not_found"
  | "forbidden"
  | "conflict"
  | "invalid"
  | "unavailable"
  | "rate_limited"
  | "quota_exceeded";

const statusByCode: Record<ErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  invalid: 400,
  unavailable: 503,
  rate_limited: 429,
  quota_exceeded: 429,
};

/** İstemciye olduğu gibi gösterilebilecek hatalar. API katmanı bunları HTTP yanıtına çevirir. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = statusByCode[code];
  }
}

export function notFound(message?: string): never {
  throw new AppError("not_found", message);
}

export function forbidden(message?: string): never {
  throw new AppError("forbidden", message);
}
