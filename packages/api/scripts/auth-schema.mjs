// Better Auth şemasını üretir: `pnpm auth:schema`.
// CLI `src/auth.ts`'i import ettiği için önce kök .env yüklenir. CLI `timestamp` kolonlarını saat dilimsiz
// ürettiğinden, sunucu ve geliştirici saat dilimleri farklı olabileceği için çıktı `timestamptz`'ye çevrilir.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const envFile = new URL("../../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const output = "../db/src/schema/auth.ts";
run("auth", ["generate", "--config", "src/auth.ts", "--output", output, "--yes"]);

const file = new URL(`../${output}`, import.meta.url);
const header = "// Better Auth CLI ile üretilir: `pnpm auth:schema`. Elle düzenleme yapma.\n";
const source = readFileSync(file, "utf8")
  .replace(/^\/\/ Better Auth CLI.*\n/, "")
  .replace(/timestamp\("([a-z_]+)"\)/g, 'timestamp("$1", { withTimezone: true })');
writeFileSync(file, header + source);

run("biome", ["check", "--write", output]);

function run(command, args) {
  const result = spawnSync("pnpm", ["exec", command, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
