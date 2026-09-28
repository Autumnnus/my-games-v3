const ROMAN: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
};

/**
 * Sondaki sürüm ekleri ("GOTY", "Complete Edition"…) aynı oyunun satış paketidir; karşılaştırmada yok sayılır.
 * Remaster/remake ayrı oyun olduğu için listede yok.
 */
const EDITION_SUFFIX =
  /(?: (?:goty|game of year|complete|definitive|enhanced|deluxe|gold|ultimate|standard|special|anniversary|directors cut)(?: edition)?)+$/;

/**
 * Oyun adlarını karşılaştırmak için sadeleştirir: aksan, noktalama, "the"/"and", Roma rakamları, sürüm
 * ekleri.
 */
export function normalizeTitle(input: string) {
  return (
    input
      // NFKD "™"yu "TM"ye açar; bu yüzden semboller önce silinir.
      .replace(/[™®©]/g, " ")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ı/g, "i")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((word) => word && word !== "the" && word !== "and")
      .map((word) => ROMAN[word] ?? word)
      .join(" ")
      .replace(EDITION_SUFFIX, "")
      .trim()
  );
}

function bigrams(value: string) {
  const text = ` ${value} `;
  const grams = new Map<string, number>();
  for (let index = 0; index < text.length - 1; index++) {
    const gram = text.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** Dice katsayısı (0–1). Adlar normalize edildikten sonra karşılaştırılır. */
export function titleSimilarity(a: string, b: string) {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  let overlap = 0;
  let total = 0;
  for (const [gram, count] of leftGrams) {
    overlap += Math.min(count, rightGrams.get(gram) ?? 0);
    total += count;
  }
  for (const count of rightGrams.values()) total += count;
  return (2 * overlap) / total;
}
