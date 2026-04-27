import type { ApiError, ApiSuccess } from "@my-games/shared";

export const ok = <T>(data: T, message?: string): ApiSuccess<T> => ({
  success: true,
  data,
  ...(message && { message }),
});

export const fail = (
  code: string,
  message: string,
  details?: unknown,
): ApiError => ({
  success: false,
  error: { code, message, ...(details !== undefined && { details }) },
});
