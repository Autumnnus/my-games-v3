import { createHmac } from "node:crypto";
import { schema } from "@my-games/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { aiConfig, aiProviderKeys, credentialsSecret } from "../config";
import { decryptCredentials, encryptCredentials } from "../credentials";
import { db } from "../db";
import { AppError } from "../errors";
import { log } from "../log";
import { readSetting, SETTING_KEYS, writeSetting } from "../settings";
import { type KeyStrategy, maskKey, type PoolKey } from "./key-pool";
import { type KeyCheck, providerAdapter, providerIds } from "./providers";

const { aiApiKeys, user } = schema;

/**
 * AI anahtar havuzunun kaynağı. Anahtarlar iki yerden gelir:
 * - Yönetim panelinden eklenenler (`ai_api_keys`, şifreli; sıra, ad, açık/kapalı panelden).
 * - Ortam değişkenleri (`GOOGLE_GENERATIVE_AI_API_KEYS`…): ilk kurulum ve geriye uyum için; panelde salt okunur.
 *
 * Her süreç (app, worker) listeyi kısa süre önbellekler; panelde yapılan değişiklik o süreçte hemen, diğerinde
 * en geç `TTL_MS` içinde geçerli olur. Havuzun çalışma durumu (dinlenen anahtarlar) `models.ts`'te.
 */
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; keys: PoolKey[] }>();

export function clearKeyCache() {
  cache.clear();
}

/** Aynı anahtarı ikinci kez eklemeyi engeller; düz SHA-256 değil, sunucu sırrıyla HMAC. */
function fingerprint(provider: string, key: string) {
  return createHmac("sha256", credentialsSecret()).update(`${provider}:${key}`).digest("hex");
}

function storedLabel(row: { name: string | null; hint: string }) {
  return row.name ? `${row.name} · ${row.hint}` : row.hint;
}

/**
 * Havuza girecek anahtarlar: önce paneldekiler (sırasıyla, yalnızca açık olanlar), sonra ortam değişkenlerinden
 * panelde olmayanlar.
 */
export async function providerKeys(provider: string): Promise<PoolKey[]> {
  const hit = cache.get(provider);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.keys;

  const rows = await db
    .select()
    .from(aiApiKeys)
    .where(eq(aiApiKeys.provider, provider))
    .orderBy(asc(aiApiKeys.position), asc(aiApiKeys.createdAt));
  // Panele eklenmiş anahtarı (kapalı olsa da) panel yönetir: env'deki kopyası havuza girmez.
  const inPanel = new Set(rows.map((row) => row.fingerprint));
  const keys: PoolKey[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.enabled) continue;
    try {
      const key = decryptCredentials<string>(row.secret);
      seen.add(key);
      keys.push({ key, label: storedLabel(row), ref: `db:${row.id}` });
    } catch (error) {
      // Sır değiştiyse (CREDENTIALS_SECRET) eski anahtarlar çözülemez; havuzu düşürmeden atlanır.
      log({
        level: "error",
        source: "ai",
        event: "key_decrypt_failed",
        message: `${provider} anahtarı çözülemedi (${row.hint}); panelden yeniden ekleyin`,
        context: { id: row.id, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  aiProviderKeys(provider).forEach((key, index) => {
    if (seen.has(key) || inPanel.has(fingerprint(provider, key))) return;
    seen.add(key);
    keys.push({ key, label: `env · ${maskKey(key)}`, ref: `env:${index}` });
  });
  cache.set(provider, { at: Date.now(), keys });
  return keys;
}

/** AI açık mı: sahte sağlayıcı ya da varsayılan sağlayıcıda en az bir anahtar. */
export async function aiEnabled() {
  const { provider } = aiConfig();
  return provider === "mock" || (await providerKeys(provider)).length > 0;
}

/** Anahtar dağıtım stratejisi: panel seçimi, yoksa `AI_KEY_STRATEGY`. */
export async function keyStrategy(): Promise<{ value: KeyStrategy; source: "setting" | "env" }> {
  const stored = await readSetting<KeyStrategy>(SETTING_KEYS.aiKeyStrategy);
  if (stored === "round_robin" || stored === "failover")
    return { value: stored, source: "setting" };
  return { value: aiConfig().keyStrategy, source: "env" };
}

export async function setKeyStrategy(value: KeyStrategy | null) {
  await writeSetting(SETTING_KEYS.aiKeyStrategy, value);
  return keyStrategy();
}

export type StoredKey = {
  id: string;
  provider: string;
  name: string | null;
  hint: string;
  enabled: boolean;
  position: number;
  createdAt: string;
  createdBy: string | null;
};

/** Yönetim ekranı: paneldeki anahtarlar (sır asla dönmez). */
export async function listStoredKeys(): Promise<StoredKey[]> {
  const rows = await db
    .select({
      id: aiApiKeys.id,
      provider: aiApiKeys.provider,
      name: aiApiKeys.name,
      hint: aiApiKeys.hint,
      enabled: aiApiKeys.enabled,
      position: aiApiKeys.position,
      createdAt: aiApiKeys.createdAt,
      createdBy: user.displayUsername,
    })
    .from(aiApiKeys)
    .leftJoin(user, eq(user.id, aiApiKeys.createdBy))
    .orderBy(asc(aiApiKeys.provider), asc(aiApiKeys.position), asc(aiApiKeys.createdAt));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/**
 * Ortam değişkenindeki anahtarlar (yalnızca ipucu). `inPanel`: aynı anahtar panele de eklenmiş; havuz panel
 * kaydını kullanır, env'deki kopya ortam değişkeninden silinebilir.
 */
export async function envKeys() {
  const stored = new Set(
    (
      await db
        .select({ provider: aiApiKeys.provider, fingerprint: aiApiKeys.fingerprint })
        .from(aiApiKeys)
    ).map((row) => `${row.provider}:${row.fingerprint}`),
  );
  return providerIds().flatMap((provider) =>
    aiProviderKeys(provider).map((key, index) => ({
      ref: `env:${index}`,
      provider,
      hint: maskKey(key),
      inPanel: stored.has(`${provider}:${fingerprint(provider, key)}`),
    })),
  );
}

function adapterOrThrow(provider: string) {
  const adapter = providerAdapter(provider);
  if (!adapter)
    throw new AppError("invalid", `bilinmeyen sağlayıcı: ${provider}`, "ai_key_provider");
  return adapter;
}

export async function checkKey(provider: string, key: string): Promise<KeyCheck> {
  const adapter = adapterOrThrow(provider);
  return adapter.verifyKey ? adapter.verifyKey(key) : { status: "ok" };
}

/**
 * Anahtarı dener ve kaydeder. Sağlayıcının açıkça reddettiği anahtar eklenmez; kota dolu ya da sağlayıcıya
 * ulaşılamıyorsa eklenir (sonuç döner, panel uyarı gösterir).
 */
export async function addKey(input: {
  provider: string;
  key: string;
  name?: string | null;
  actorId: string | null;
}) {
  const key = input.key.trim();
  const provider = input.provider;
  adapterOrThrow(provider);
  const print = fingerprint(provider, key);
  const [duplicate] = await db
    .select({ id: aiApiKeys.id })
    .from(aiApiKeys)
    .where(and(eq(aiApiKeys.provider, provider), eq(aiApiKeys.fingerprint, print)));
  // Ortam değişkenindeki bir anahtar panele taşınabilir: havuzda panel kaydı kullanılır, env kopyası atlanır.
  if (duplicate) {
    throw new AppError("conflict", "Bu anahtar havuzda zaten var", "ai_key_duplicate");
  }

  const check = await checkKey(provider, key);
  if (check.status === "invalid") {
    throw new AppError(
      "invalid",
      `Sağlayıcı anahtarı reddetti: ${check.message}`,
      "ai_key_invalid",
    );
  }

  const [last] = await db
    .select({ position: sql<number>`coalesce(max(${aiApiKeys.position}), -1)` })
    .from(aiApiKeys)
    .where(eq(aiApiKeys.provider, provider));
  const [row] = await db
    .insert(aiApiKeys)
    .values({
      provider,
      name: input.name?.trim() || null,
      secret: encryptCredentials(key),
      fingerprint: print,
      hint: maskKey(key),
      position: (last?.position ?? -1) + 1,
      createdBy: input.actorId,
    })
    .returning({ id: aiApiKeys.id, hint: aiApiKeys.hint, name: aiApiKeys.name });
  if (!row) throw new Error("ai_api_keys insert failed");
  cache.delete(provider);
  return { ...row, provider, check };
}

async function findKey(id: string) {
  const [row] = await db.select().from(aiApiKeys).where(eq(aiApiKeys.id, id));
  if (!row) throw new AppError("not_found", "Anahtar bulunamadı", "ai_key_not_found");
  return row;
}

export async function updateKey(id: string, patch: { name?: string | null; enabled?: boolean }) {
  const current = await findKey(id);
  const [row] = await db
    .update(aiApiKeys)
    .set({
      ...(patch.name !== undefined ? { name: patch.name?.trim() || null } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    })
    .where(eq(aiApiKeys.id, id))
    .returning({ id: aiApiKeys.id, name: aiApiKeys.name, hint: aiApiKeys.hint });
  cache.delete(current.provider);
  return { ...row, provider: current.provider };
}

export async function deleteKey(id: string) {
  const current = await findKey(id);
  await db.delete(aiApiKeys).where(eq(aiApiKeys.id, id));
  cache.delete(current.provider);
  return { id, provider: current.provider, name: current.name, hint: current.hint };
}

/** Sağlayıcının paneldeki anahtarlarını verilen sıraya dizer (liste tam ve aynı sağlayıcıdan olmalı). */
export async function reorderKeys(provider: string, ids: string[]) {
  const rows = await db
    .select({ id: aiApiKeys.id })
    .from(aiApiKeys)
    .where(eq(aiApiKeys.provider, provider));
  const known = new Set(rows.map((row) => row.id));
  if (
    ids.length !== known.size ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => known.has(id))
  ) {
    throw new AppError("invalid", "Sıralama listesi eksik ya da hatalı", "ai_key_order");
  }
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx.update(aiApiKeys).set({ position }).where(eq(aiApiKeys.id, id));
    }
  });
  cache.delete(provider);
}

/** Kayıtlı anahtarı çözüp yeniden dener ("Test et"). */
export async function testStoredKey(id: string) {
  const row = await findKey(id);
  const key = decryptCredentials<string>(row.secret);
  return { provider: row.provider, hint: row.hint, check: await checkKey(row.provider, key) };
}
