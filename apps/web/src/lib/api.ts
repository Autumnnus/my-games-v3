import type { AppType } from "@my-games/api";
import { notFound } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { hc } from "hono/client";

/**
 * Tüm veri Hono API'den gelir (desktop/Tauri de aynı API'yi kullanacak).
 * SSR sırasında istek ağa çıkmadan process içinde Hono'ya verilir; tarayıcıda normal fetch yapılır.
 */
const apiFetch = createIsomorphicFn()
  .server(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { serverFetch } = await import("./api.server");
    return serverFetch(input, init);
  })
  .client((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, credentials: "include" }),
  );

export const api = hc<AppType>("/", { fetch: apiFetch }).api.v1;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

type JsonOf<R> = R extends { json(): Promise<infer T> } ? T : never;
type Success<R> = Exclude<JsonOf<R>, { error: string }>;

/** Başarılı yanıtın gövdesini döner; hata yanıtını `ApiError` olarak fırlatır. */
export async function unwrap<R extends { ok: boolean; status: number; json(): Promise<unknown> }>(
  response: R | Promise<R>,
): Promise<Success<R>> {
  const resolved = await response;
  if (!resolved.ok) {
    const body = (await resolved.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiError(resolved.status, body.error ?? "error", body.message);
  }
  return (await resolved.json()) as Success<R>;
}

/** Loader'larda: API 404 dönerse router'ın "bulunamadı" sayfası gösterilir. */
export async function orNotFound<T>(promise: Promise<T>) {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw notFound();
    throw error;
  }
}
