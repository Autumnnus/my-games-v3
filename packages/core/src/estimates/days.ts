/**
 * Tahmin hesapları takvim günleri üzerinde çalışır: gün, UTC'de 1970-01-01'den bu yana geçen gün sayısıdır
 * (tam sayı, aritmetiği kolay); saklama ve API biçimi `YYYY-MM-DD`.
 */
export type DayNumber = number;

const DAY_MS = 86_400_000;

export const dayOf = (iso: string): DayNumber =>
  Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);

export const dayOfDate = (date: Date): DayNumber => Math.floor(date.getTime() / DAY_MS);

export const isoOf = (day: DayNumber) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** 0 = Pazar … 6 = Cumartesi (`Date#getUTCDay` gibi). 1970-01-01 Perşembe'dir. */
export const weekdayOf = (day: DayNumber) => (((day + 4) % 7) + 7) % 7;

/** FNV-1a (32 bit): aynı metin her zaman aynı tohumu verir. */
export function hashSeed(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Tohumlu rastgele sayı üreteci (mulberry32). Aynı tohum → aynı dizi; tahminler bu yüzden kararlıdır. */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  /** Standart normal (Box–Muller). */
  const normal = () => {
    const u = 1 - next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, normal };
}

export type Random = ReturnType<typeof createRandom>;

/**
 * `total`'ı ağırlıklara göre tam sayılara böler; toplam her zaman tam `total` olur (en büyük kalan
 * yöntemi). Eşit kalanlarda önce gelen kazanır, sonuç deterministiktir.
 */
export function apportion(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((acc, weight) => acc + Math.max(0, weight), 0);
  const raw = weights.map((weight) =>
    sum > 0 ? (total * Math.max(0, weight)) / sum : total / weights.length,
  );
  const result = raw.map(Math.floor);
  let rest = total - result.reduce((acc, value) => acc + value, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; rest > 0; index = (index + 1) % order.length, rest--) {
    const target = order[index];
    if (target) result[target.index] = (result[target.index] ?? 0) + 1;
  }
  return result;
}

/** Ay anahtarı: yıl × 12 + ay (0–11). */
export function monthOf(day: DayNumber) {
  const date = new Date(day * DAY_MS);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** Ayın ilk ve son günü. */
export function monthRange(month: number): [DayNumber, DayNumber] {
  const year = Math.floor(month / 12);
  const index = month % 12;
  return [
    dayOfDate(new Date(Date.UTC(year, index, 1))),
    dayOfDate(new Date(Date.UTC(year, index + 1, 1))) - 1,
  ];
}
