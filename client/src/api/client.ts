import { useAuthStore } from "@/store/auth.store";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3030";

export type ApiError = Error & {
  code: string;
  details?: unknown;
  httpStatus?: number;
};

export function createApiError(
  code: string,
  message: string,
  details?: unknown,
  status?: number,
): ApiError {
  const err = new Error(message) as ApiError;
  err.name = "ApiError";
  err.code = code;
  err.details = details;
  err.httpStatus = status;
  return err;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof Error && err.name === "ApiError";
}

type FetchOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined | null>;
};

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { params, ...init } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        search.set(k, String(v));
      }
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }

  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    useAuthStore.getState().clearAuth();
    window.location.href = "/login";
    throw createApiError("UNAUTHORIZED", "Session expired", undefined, 401);
  }

  const json = await res.json().catch(() => null);

  if (!json) {
    if (!res.ok)
      throw createApiError(
        "UNKNOWN",
        `HTTP ${res.status}`,
        undefined,
        res.status,
      );
    return undefined as T;
  }

  if (json.success === false) {
    throw createApiError(
      json.error?.code ?? "API_ERROR",
      json.error?.message ?? "Something went wrong",
      json.error?.details,
      res.status,
    );
  }

  return (json.data ?? json) as T;
}
