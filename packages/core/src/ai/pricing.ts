import { z } from "zod";
import { readSetting, SETTING_KEYS, writeSetting } from "../settings";

/** USD / 1M token. `cachedInput` yoksa önbellekten okunan token da normal giriş fiyatından sayılır. */
export const modelPriceSchema = z.object({
  input: z.number().min(0).max(1000),
  output: z.number().min(0).max(1000),
  cachedInput: z.number().min(0).max(1000).optional(),
});
export type ModelPrice = z.infer<typeof modelPriceSchema>;

export const priceTableSchema = z
  .record(z.string().trim().min(1).max(100), modelPriceSchema)
  .refine((table) => Object.keys(table).length <= 100, "En fazla 100 model");
export type PriceTable = z.infer<typeof priceTableSchema>;

/**
 * Başlangıç fiyatları: Gemini API ücretli katman, standart (batch değil) liste fiyatları
 * (ai.google.dev/gemini-api/docs/pricing, 2026-09-30'da okundu). 3.6–3.8 Flash fiyatları 1 Ocak 2027'de
 * iki katına çıkıyor. Ücretsiz katmandaki anahtarların gerçek faturası 0'dır; panel bunu liste fiyatıyla
 * tahmin olarak gösterir. Tablo yönetim panelinden değiştirilir.
 */
export const DEFAULT_PRICES: PriceTable = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75, cachedInput: 0.075 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75, cachedInput: 0.075 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75, cachedInput: 0.075 },
  "gemini-3.5-flash": { input: 1.5, output: 9, cachedInput: 0.15 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cachedInput: 0.03 },
  "gemini-3-flash-preview": { input: 0.5, output: 3, cachedInput: 0.05 },
  "gemini-3.1-pro-preview": { input: 2, output: 12, cachedInput: 0.2 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cachedInput: 0.03 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4, cachedInput: 0.01 },
};

export async function aiPrices(): Promise<PriceTable> {
  const stored = await readSetting<unknown>(SETTING_KEYS.aiPrices);
  const parsed = priceTableSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_PRICES;
}

export async function setAiPrices(table: PriceTable | null) {
  await writeSetting(SETTING_KEYS.aiPrices, table);
  return aiPrices();
}

/**
 * Modelin fiyatı. Sağlayıcıların bildirdiği kimlikler tablodakinden farklı olabilir (`models/…` öneki,
 * `-001` gibi sürüm eki, `google:` gibi sağlayıcı öneki); önce tam eşleşme, sonra en uzun önek aranır.
 */
export function priceFor(table: PriceTable, model: string): ModelPrice | null {
  const id = model.replace(/^[a-z0-9-]+:/i, "").replace(/^models\//, "");
  const exact = table[id];
  if (exact) return exact;
  let best: { key: string; price: ModelPrice } | null = null;
  for (const [key, price] of Object.entries(table)) {
    if (id.startsWith(key) && (!best || key.length > best.key.length)) best = { key, price };
  }
  return best?.price ?? null;
}

export type TokenCounts = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

/** Çağrının maliyeti (USD). Çıkış token'larına düşünme (reasoning) token'ları dahildir. */
export function costOf(price: ModelPrice | null, tokens: TokenCounts) {
  if (!price) return 0;
  const cached = Math.min(tokens.cachedInputTokens, tokens.inputTokens);
  const fresh = tokens.inputTokens - cached;
  return (
    (fresh * price.input +
      cached * (price.cachedInput ?? price.input) +
      tokens.outputTokens * price.output) /
    1_000_000
  );
}
