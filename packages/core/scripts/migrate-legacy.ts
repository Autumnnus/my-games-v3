/**
 * Eski sistemdeki (Firestore dönemi) oyun kayıtlarını yeni kütüphaneye aktarır.
 *
 *   pnpm --filter @my-games/core migrate:legacy -- --file ../../../my-games-old/old_db_data/kadir_games.json --user kadir --dry-run
 *
 * - Hedef kullanıcı önceden kayıt olmuş olmalı (`--user` kullanıcı adı).
 * - Tekrar çalıştırılabilir: aktarılmış kayıtlar (`legacy_ref`) atlanır.
 * - IGDB anahtarları tanımlıysa oyunlar IGDB ile eşleştirilir; belirsizler onay kutusuna düşer.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { closeDb } from "../src/db";
import { importLegacyRecords, type LegacyRecord } from "../src/legacy";
import { findUserByUsername } from "../src/users";

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    user: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

if (!values.file || !values.user) {
  console.error("Kullanım: migrate-legacy --file <json> --user <kullanıcı adı> [--dry-run]");
  process.exit(1);
}

const records = JSON.parse(readFileSync(values.file, "utf8")) as LegacyRecord[];
const user = await findUserByUsername(values.user);
if (!user) {
  console.error(`Kullanıcı bulunamadı: ${values.user}. Önce hesap açılmalı.`);
  process.exit(1);
}

console.log(
  `${records.length} kayıt → @${user.displayUsername ?? user.username}${values["dry-run"] ? " (dry-run)" : ""}`,
);
const report = await importLegacyRecords(user.id, records, {
  dryRun: values["dry-run"],
  log: (line) => console.log(line),
});

console.log("\nÖzet");
console.log(`  aktarılan:            ${report.imported}`);
console.log(`  zaten aktarılmış:     ${report.skippedExisting}`);
console.log(
  `  tekrar eden (atlanan): ${report.duplicates.length}${report.duplicates.length ? ` (${report.duplicates.join(", ")})` : ""}`,
);
console.log(`  IGDB otomatik eşleşme: ${report.autoMatched}`);
console.log(`  onay bekleyen eşleşme: ${report.pendingMatches}`);
console.log(`  eşleşmesiz:           ${report.unmatched}`);
console.log(`  screenshot:           ${report.screenshots}`);
if (report.warnings.length) {
  console.log("\nDüzeltilen değerler");
  for (const item of report.warnings) console.log(`  ${item.name}: ${item.warnings.join("; ")}`);
}
await closeDb();
