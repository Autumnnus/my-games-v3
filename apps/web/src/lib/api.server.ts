import "@tanstack/react-start/server-only";
import { app } from "@my-games/api";
import { getRequestHeader } from "@tanstack/react-start/server";

// Kullanıcının oturumu, dil tercihi ve IP'si (rate limit) SSR'daki iç çağrılara da taşınır.
const FORWARDED_HEADERS = [
  "cookie",
  "accept-language",
  "user-agent",
  "cf-connecting-ip",
  "x-forwarded-for",
] as const;

export function serverFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = input instanceof Request ? input.url : String(input);
  const request = new Request(new URL(url, "http://internal"), init);
  for (const name of FORWARDED_HEADERS) {
    const value = getRequestHeader(name);
    if (value && !request.headers.has(name)) request.headers.set(name, value);
  }
  return app.fetch(request);
}
