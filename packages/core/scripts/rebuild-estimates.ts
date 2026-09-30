/**
 * Takipten önceki oynama geçmişi tahminini hemen üretir (worker bunu sync sonrasında ve 20 dakikada bir
 * kendisi yapar). Kullanım:
 *   pnpm --filter @my-games/core estimates:rebuild -- --user kadir [--no-ai] [--force] [--ask-ai]
 * `--force`: planları yeniden kurar (saklanan AI ipuçlarıyla); `--ask-ai`: belirsiz oyunları AI'ya yeniden sorar.
 *   pnpm --filter @my-games/core estimates:rebuild -- --all
 */
import { schema } from "@my-games/db";
import { desc, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { rebuildPlayEstimates } from "../src/estimates/build";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const username = value("user");
const users = flag("all")
  ? await db.select({ id: schema.user.id, username: schema.user.username }).from(schema.user)
  : username
    ? await db
        .select({ id: schema.user.id, username: schema.user.username })
        .from(schema.user)
        .where(eq(sql`lower(${schema.user.username})`, username.toLowerCase()))
    : [];
if (users.length === 0) {
  console.error("Kullanıcı yok. --user <kullanıcı adı> ya da --all verin.");
  process.exit(1);
}

const hours = (minutes: number) => `${Math.round(minutes / 60)} sa`;
for (const user of users) {
  const started = Date.now();
  const stats = await rebuildPlayEstimates(user.id, {
    ai: !flag("no-ai"),
    force: flag("force"),
    askAgain: flag("ask-ai"),
  });
  console.log(`\n[estimates] ${user.username}: ${Date.now() - started} ms`, stats);
  const plans = await db
    .select({
      name: schema.games.name,
      budgetMin: schema.playEstimatePlans.budgetMin,
      pattern: schema.playEstimatePlans.pattern,
      planner: schema.playEstimatePlans.planner,
      confidence: schema.playEstimatePlans.confidence,
      needsAi: schema.playEstimatePlans.needsAi,
      windowFrom: schema.playEstimatePlans.windowFrom,
      windowTo: schema.playEstimatePlans.windowTo,
      plan: schema.playEstimatePlans.plan,
    })
    .from(schema.playEstimatePlans)
    .innerJoin(
      schema.libraryEntries,
      eq(schema.libraryEntries.id, schema.playEstimatePlans.entryId),
    )
    .innerJoin(schema.games, eq(schema.games.id, schema.libraryEntries.gameId))
    .where(eq(schema.playEstimatePlans.userId, user.id))
    .orderBy(desc(schema.playEstimatePlans.budgetMin))
    .limit(Number(value("top") ?? 15));
  for (const plan of plans) {
    const phases = plan.plan.phases
      .map(
        (phase) => `${phase.from}→${phase.to} ${Math.round(phase.share * 100)}% ${phase.intensity}`,
      )
      .join(" | ");
    console.log(
      `  ${plan.name.slice(0, 32).padEnd(32)} ${hours(plan.budgetMin).padStart(8)}  ${plan.pattern.padEnd(8)} ${plan.planner.padEnd(9)} ${plan.confidence.toFixed(2)}${plan.needsAi ? " ai?" : "    "}  [${plan.windowFrom}..${plan.windowTo}]  ${phases}`,
    );
    if (plan.plan.note) console.log(`  ${"".padEnd(32)} ↳ ${plan.plan.note}`);
  }
}
await closeDb();
