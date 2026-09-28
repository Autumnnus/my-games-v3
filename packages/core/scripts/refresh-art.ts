/**
 * Tüm katalogun sahne görsellerini, logolarını ve kapak renklerini hemen doldurur (worker saatte bir
 * 60 oyun işler; ilk kurulumda beklemek istemeyince bu çalıştırılır).
 */
import { refreshGameArt } from "../src/catalog";
import { closeDb } from "../src/db";

let total = 0;
for (let round = 0; round < 50; round++) {
  const result = await refreshGameArt(50);
  total += result.checked;
  console.log(`[art] ${result.checked} oyun tarandı, ${result.updated} güncellendi`);
  if (result.checked === 0) break;
}
console.log(`[art] bitti: ${total} oyun`);
await closeDb();
