import { schema } from "@my-games/db";
import type { EntryStatus } from "@my-games/shared";
import { generateText, Output } from "ai";
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { z } from "zod";
import { resolveModel } from "../ai/models";
import { recordRun } from "../ai/usage";
import { db } from "../db";
import { errorMessageOf, logger } from "../log";
import { type FinishEvidence, notifyPending, propose } from "../proposals";
import { dayOfDate, isoOf } from "./days";

const { libraryEntries, games, achievementSets, achievements, userAchievements, changeProposals } =
  schema;

/** Bir çağrıda sınıflandırılan oyun ve bir derlemedeki en fazla çağrı (kalanlar sonraki derlemeye). */
const ENDINGS_BATCH = 8;
const ENDINGS_MAX_BATCHES = 5;
/** Oyun başına AI'ya gösterilen en fazla başarım (gizliler ve yaygın olanlar önce). */
const ENDINGS_MAX_ITEMS = 120;
/** Aynı dakikada bu kadar başarım: toplu/geriye dönük açılım; tarihi bitirme günü sayılmaz. */
const BURST = 5;
/** Bundan eski bitirmeler onaylanınca akışa "şimdi bitirdi" diye düşmez. */
const SILENT_AFTER_DAYS = 7;
/** Bitirme önerisi verilmeyen durumlar (bırakılan ve sonu olmayan oyunlar). */
const SKIPPED: EntryStatus[] = ["dropped", "endless"];

type SetKey = { provider: string; gameKey: string };
const keyOf = (set: SetKey) => `${set.provider}:${set.gameKey}`;

/**
 * Oyunların "ana hikâyeyi bitirdin" başarımlarını AI'ya sorar (herhangi bir son). Sonlar çoğu zaman gizli
 * başarımdır ve platform açıklamasını vermez; anahtar kelime işe yaramaz, oyun bilgisi gerekir. Sonuç başarım
 * setinde saklanır ve tüm kullanıcılar için ortaktır; çağrı, derlemeyi tetikleyen kullanıcıya yazılır.
 */
async function classifyEndings(userId: string, sets: Array<SetKey & { name: string }>) {
  if (sets.length === 0) return 0;
  let resolved: Awaited<ReturnType<typeof resolveModel>>;
  try {
    resolved = await resolveModel("light");
  } catch {
    return 0;
  }
  if (resolved.id === "mock") return 0;

  let classified = 0;
  for (let batch = 0; batch < ENDINGS_MAX_BATCHES; batch++) {
    const items = sets.slice(batch * ENDINGS_BATCH, (batch + 1) * ENDINGS_BATCH);
    if (items.length === 0) break;
    const rows = await db
      .select({
        provider: achievements.provider,
        gameKey: achievements.gameKey,
        apiName: achievements.apiName,
        name: achievements.name,
        description: achievements.description,
        hidden: achievements.hidden,
        rarity: achievements.rarity,
      })
      .from(achievements)
      .where(
        sql`(${achievements.provider}, ${achievements.gameKey}) in (${sql.join(
          items.map((item) => sql`(${item.provider}, ${item.gameKey})`),
          sql`, `,
        )})`,
      );
    const bySet = new Map<string, typeof rows>();
    for (const row of rows) bySet.set(keyOf(row), [...(bySet.get(keyOf(row)) ?? []), row]);
    const keys = new Map(items.map((item, index) => [`g${index + 1}`, item]));
    const lines = [...keys].map(([key, item]) => {
      const list = (bySet.get(keyOf(item)) ?? [])
        .sort((a, b) => Number(b.hidden) - Number(a.hidden) || (b.rarity ?? 0) - (a.rarity ?? 0))
        .slice(0, ENDINGS_MAX_ITEMS)
        .map(
          (row) =>
            `  ${row.apiName} | ${row.name}${row.description ? ` | ${row.description}` : ""}${row.hidden ? " | hidden" : ""}${row.rarity !== null ? ` | ${Math.round(row.rarity)}%` : ""}`,
        );
      return [`[${key}] "${item.name}"`, ...list].join("\n");
    });

    const startedAt = Date.now();
    try {
      const response = await generateText({
        model: resolved.model,
        maxRetries: 0,
        maxOutputTokens: 1500,
        output: Output.object({
          schema: z.object({
            games: z.array(z.object({ key: z.string(), endings: z.array(z.string()).max(20) })),
          }),
        }),
        prompt: [
          "For each game below, pick the achievements a player unlocks by finishing the main story or campaign: reaching any ending, beating the final boss, rolling the credits. Include every ending and every difficulty's completion. Don't include side content, DLC-only stories, collectibles, or new game+.",
          "Use what you know about each game; hidden achievements have no description here, so recognise endings by name. Return the ids (the first column) exactly as written. Return an empty list for games without a main story ending (multiplayer, sandbox, strategy, endless games) or when you aren't sure.",
          "Columns: id | name | description | hidden | % of players who unlocked it.",
          'Answer with the game\'s key in brackets (like "g1"), not its name.',
          ...lines,
        ].join("\n"),
      });
      await recordRun({ userId, purpose: "endings", startedAt, steps: response.steps });
      const now = new Date();
      // Model anahtar yerine bazen oyunun adını yazıyor; ikisi de kabul edilir.
      const byName = new Map(items.map((item) => [item.name.trim().toLowerCase(), item]));
      for (const answer of response.output.games) {
        const set = keys.get(answer.key.trim()) ?? byName.get(answer.key.trim().toLowerCase());
        if (!set) continue;
        const known = new Set((bySet.get(keyOf(set)) ?? []).map((row) => row.apiName));
        await db
          .update(achievementSets)
          .set({
            endingApiNames: answer.endings.filter((apiName) => known.has(apiName)),
            endingsCheckedAt: now,
          })
          .where(
            and(
              eq(achievementSets.provider, set.provider),
              eq(achievementSets.gameKey, set.gameKey),
            ),
          );
        classified++;
      }
    } catch (error) {
      logger.warn(
        "ai",
        "endings_failed",
        `oyun sonları sınıflandırılamadı: ${errorMessageOf(error)}`,
        {
          userId,
        },
      );
      await recordRun({ userId, purpose: "endings", startedAt, error }).catch(() => {});
      break;
    }
  }
  return classified;
}

/**
 * Bitirme tarihi önerileri. Bitirme tarihi boş kayıtlarda:
 * - Oyunun sonunu veren başarım açıldıysa: en erken açıldığı gün (kayıt "bitirildi" değilse durum da). Toplu
 *   açılımlar (aynı dakikada çok başarım) tarih sayılmaz.
 * - Başarım yoksa (Epic, GOG, elle girilmiş) yalnızca "bitirdim" denmiş kayıtlara son oynama günü.
 * Öneriler onay kutusuna düşer; aynı kayıt için bir kez önerilir (reddedilen tekrar gelmez). Eski bitirmeler
 * onaylanınca akışa düşmez.
 */
export async function suggestFinishDates(userId: string, options: { ai?: boolean } = {}) {
  const [owner] = await db
    .select({ locale: schema.user.locale })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  if (!owner) return null;

  const entries = await db
    .select({
      entryId: libraryEntries.id,
      gameId: libraryEntries.gameId,
      status: libraryEntries.status,
      lastPlayedAt: libraryEntries.lastPlayedAt,
      name: games.name,
    })
    .from(libraryEntries)
    .innerJoin(games, eq(games.id, libraryEntries.gameId))
    .where(and(eq(libraryEntries.userId, userId), isNull(libraryEntries.finishedAt)));
  const candidates = entries.filter((entry) => !SKIPPED.includes(entry.status));
  if (candidates.length === 0) return { classified: 0, proposed: 0 };

  // Kullanıcının başarım açtığı setler (yalnızca bu kayıtların oyunları).
  const sets = await db
    .selectDistinct({
      provider: achievementSets.provider,
      gameKey: achievementSets.gameKey,
      gameId: achievementSets.gameId,
      endingApiNames: achievementSets.endingApiNames,
      endingsCheckedAt: achievementSets.endingsCheckedAt,
    })
    .from(achievementSets)
    .innerJoin(
      userAchievements,
      and(
        eq(userAchievements.provider, achievementSets.provider),
        eq(userAchievements.gameKey, achievementSets.gameKey),
        eq(userAchievements.userId, userId),
      ),
    )
    .where(
      inArray(
        achievementSets.gameId,
        candidates.map((entry) => entry.gameId),
      ),
    );

  let classified = 0;
  if (options.ai !== false) {
    const names = new Map(candidates.map((entry) => [entry.gameId, entry.name]));
    const unclassified = sets
      .filter((set) => !set.endingsCheckedAt)
      .map((set) => ({ ...set, name: names.get(set.gameId ?? "") ?? set.gameKey }));
    classified = await classifyEndings(userId, unclassified);
  }
  const fresh =
    classified > 0
      ? await db
          .select({
            provider: achievementSets.provider,
            gameKey: achievementSets.gameKey,
            endingApiNames: achievementSets.endingApiNames,
          })
          .from(achievementSets)
          .where(
            sql`(${achievementSets.provider}, ${achievementSets.gameKey}) in (${sql.join(
              sets.map((set) => sql`(${set.provider}, ${set.gameKey})`),
              sql`, `,
            )})`,
          )
      : [];
  const endings = new Map(
    [...sets, ...fresh]
      .filter((set) => set.endingApiNames && set.endingApiNames.length > 0)
      .map((set) => [keyOf(set), set.endingApiNames ?? []]),
  );

  // Sonu veren başarımların açılma anları (toplu açılımlar hariç) ve adları.
  const endingSets = sets.filter((set) => endings.has(keyOf(set)));
  const unlocks =
    endingSets.length === 0
      ? []
      : await db
          .select({
            provider: userAchievements.provider,
            gameKey: userAchievements.gameKey,
            apiName: userAchievements.apiName,
            unlockedAt: userAchievements.unlockedAt,
            // Aynı dakikadaki tüm açılımlar (tanımı olmayanlar dahil) sayılır.
            burst: sql<number>`(select count(*)::int from ${userAchievements} b
              where b.user_id = ${userAchievements.userId} and b.provider = ${userAchievements.provider}
                and b.game_key = ${userAchievements.gameKey}
                and date_trunc('minute', b.unlocked_at) = date_trunc('minute', ${userAchievements.unlockedAt}))`,
            name: achievements.name,
            localized: achievements.localized,
          })
          .from(userAchievements)
          .innerJoin(
            achievements,
            and(
              eq(achievements.provider, userAchievements.provider),
              eq(achievements.gameKey, userAchievements.gameKey),
              eq(achievements.apiName, userAchievements.apiName),
            ),
          )
          .where(
            and(
              eq(userAchievements.userId, userId),
              sql`${userAchievements.unlockedAt} is not null`,
              sql`(${userAchievements.provider}, ${userAchievements.gameKey}) in (${sql.join(
                endingSets.map((set) => sql`(${set.provider}, ${set.gameKey})`),
                sql`, `,
              )})`,
            ),
          );
  const firstEnding = new Map<string, { at: Date; name: string; provider: string }>();
  for (const unlock of unlocks) {
    if (!unlock.unlockedAt || unlock.burst >= BURST) continue;
    if (!endings.get(keyOf(unlock))?.includes(unlock.apiName)) continue;
    const set = endingSets.find((item) => keyOf(item) === keyOf(unlock));
    if (!set?.gameId) continue;
    const current = firstEnding.get(set.gameId);
    if (current && current.at <= unlock.unlockedAt) continue;
    const name =
      (owner.locale && unlock.localized?.[owner.locale]?.name) || unlock.name || unlock.apiName;
    firstEnding.set(set.gameId, { at: unlock.unlockedAt, name, provider: unlock.provider });
  }

  const asked = new Set(
    (
      await db
        .select({ dedupeKey: changeProposals.dedupeKey })
        .from(changeProposals)
        .where(
          and(
            eq(changeProposals.userId, userId),
            like(changeProposals.dedupeKey, "%:finish_date:%"),
          ),
        )
    ).map((row) => row.dedupeKey),
  );

  let proposed = 0;
  const now = Date.now();
  await db.transaction(async (tx) => {
    for (const entry of candidates) {
      const ending = firstEnding.get(entry.gameId);
      const source = ending ? (ending.provider as "steam" | "psn" | "xbox") : "system";
      const dedupeKey = `${source}:finish_date:${entry.entryId}`;
      if (asked.has(dedupeKey)) continue;
      let at: Date;
      let evidence: FinishEvidence;
      if (ending) {
        at = ending.at;
        evidence = { kind: "achievement", name: ending.name, at: ending.at.toISOString() };
      } else if (entry.status === "completed" && entry.lastPlayedAt) {
        at = entry.lastPlayedAt;
        evidence = { kind: "last_played", at: entry.lastPlayedAt.toISOString() };
      } else continue;

      const changes: Array<{ field: string; from: unknown; to: unknown }> = [
        { field: "finishedAt", from: null, to: isoOf(dayOfDate(at)) },
      ];
      if (entry.status !== "completed") {
        changes.unshift({ field: "status", from: entry.status, to: "completed" });
      }
      const result = await propose(tx, {
        userId,
        source,
        kind: "finish_date",
        entryId: entry.entryId,
        gameId: entry.gameId,
        dedupeKey,
        confidence: ending ? 0.9 : 0.5,
        initial: now - at.getTime() > SILENT_AFTER_DAYS * 86_400_000,
        payload: { op: "update", changes, evidence },
      });
      if (result.status !== "ignored") proposed++;
    }
    await notifyPending(tx, userId, proposed);
  });
  return { classified, proposed };
}
