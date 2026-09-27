import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { igdbConfig } from "../config";
import { db } from "../db";
import { AppError } from "../errors";

const API = "https://api.igdb.com/v4";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TOKEN_KEY = "igdb_token";

type StoredToken = { accessToken: string; expiresAt: number };

let memoryToken: StoredToken | null = null;

async function loadToken(forceRefresh = false): Promise<string> {
  const config = igdbConfig();
  if (!config) throw new AppError("unavailable", "IGDB yapılandırılmamış");

  // Token 60 gün geçerli; süresinin dolmasına bir günden az kalmışsa yenilenir.
  const fresh = (token: StoredToken | null) =>
    token && token.expiresAt - Date.now() > 24 * 60 * 60 * 1000 ? token : null;

  if (!forceRefresh) {
    const cached = fresh(memoryToken);
    if (cached) return cached.accessToken;
    const [row] = await db
      .select()
      .from(schema.appConfig)
      .where(eq(schema.appConfig.key, TOKEN_KEY));
    const stored = fresh((row?.value as StoredToken | undefined) ?? null);
    if (stored) {
      memoryToken = stored;
      return stored.accessToken;
    }
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) {
    throw new AppError("unavailable", `IGDB token alınamadı: ${response.status}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  const token: StoredToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  await db
    .insert(schema.appConfig)
    .values({ key: TOKEN_KEY, value: token })
    .onConflictDoUpdate({ target: schema.appConfig.key, set: { value: token } });
  memoryToken = token;
  return token.accessToken;
}

// --- Hız sınırı: IGDB 4 istek/sn ve en fazla 8 eşzamanlı istek kabul ediyor. ---
const MIN_INTERVAL_MS = 260;
const MAX_CONCURRENT = 6;
let active = 0;
let lastStart = 0;
const waiting: Array<() => void> = [];

async function acquire() {
  while (true) {
    const wait = lastStart + MIN_INTERVAL_MS - Date.now();
    if (active < MAX_CONCURRENT && wait <= 0) {
      active++;
      lastStart = Date.now();
      return;
    }
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
      setTimeout(resolve, Math.max(wait, 20));
    });
  }
}

function release() {
  active--;
  waiting.shift()?.();
}

/** Apicalypse sorgusu gönderir. 401'de token'ı bir kez yeniler, 429'da artan beklemeyle tekrar dener. */
export async function igdbQuery<T>(endpoint: string, body: string): Promise<T> {
  const config = igdbConfig();
  if (!config) throw new AppError("unavailable", "IGDB yapılandırılmamış");

  let token = await loadToken();
  for (let attempt = 0; attempt < 4; attempt++) {
    await acquire();
    let response: Response;
    try {
      response = await fetch(`${API}/${endpoint}`, {
        method: "POST",
        headers: {
          "Client-ID": config.clientId,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "text/plain",
        },
        body,
      });
    } finally {
      release();
    }

    if (response.ok) return (await response.json()) as T;
    if (response.status === 401 && attempt === 0) {
      token = await loadToken(true);
      continue;
    }
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      continue;
    }
    throw new AppError(
      "unavailable",
      `IGDB ${endpoint} ${response.status}: ${await response.text()}`,
    );
  }
  throw new AppError("rate_limited", "IGDB istek sınırı aşıldı");
}

/** Kullanıcı girdisini `search "..."` içine güvenle koymak için tırnak ve ters bölüleri atar. */
export function sanitizeSearch(input: string) {
  return (
    input
      .replace(/["\\]/g, " ")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: kontrol karakterleri bilinçli olarak temizleniyor
      .replace(/[\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100)
  );
}

/** Test için bellek içi token'ı sıfırlar. */
export function resetIgdbTokenCache() {
  memoryToken = null;
}
