import { schema } from "@my-games/db";
import { generateText, Output } from "ai";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { notFound } from "../errors";
import { errorMessageOf, logger } from "../log";
import { briefOf } from "./actions";
import { resolveModel } from "./models";
import { recordRun } from "./usage";

const {
  libraryEntries: e,
  games: g,
  playSessions,
  achievementSets,
  achievements,
  userAchievements,
  aiRecaps,
} = schema;

const DAY = 24 * 60 * 60 * 1000;
const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

type RecapText = { headline: string; summary: string | null; ai: boolean };

function templateHeadline(days: number | null, locale: string) {
  if (days === null) return locale === "tr" ? "Tekrar hoş geldin." : "Welcome back.";
  if (locale === "tr") return days <= 1 ? "Dün buradaydın." : `${days} gün sonra döndün.`;
  return days <= 1 ? "You were here yesterday." : `Back after ${days} days.`;
}

async function recapData(entryId: string, userId: string, locale: string) {
  const [row] = await db
    .select({ entry: e, game: g })
    .from(e)
    .innerJoin(g, eq(g.id, e.gameId))
    .where(eq(e.id, entryId));
  if (!row || row.entry.userId !== userId) notFound("Kayıt bulunamadı", "entry_not_found");
  const last = row.entry.lastPlayedAt;
  const until = new Date((last?.getTime() ?? Date.now()) + DAY);

  const [sessions, weekly, unlocked] = await Promise.all([
    db
      .select({ startedAt: playSessions.startedAt, minutes: playSessions.durationMin })
      .from(playSessions)
      .where(and(eq(playSessions.userId, userId), eq(playSessions.gameId, row.game.id)))
      .orderBy(desc(playSessions.startedAt))
      .limit(6),
    db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${playSessions.startedAt}), 'YYYY-MM-DD')`,
        minutes: sql<number>`sum(${playSessions.durationMin})::int`,
      })
      .from(playSessions)
      .where(
        and(
          eq(playSessions.userId, userId),
          eq(playSessions.gameId, row.game.id),
          lte(playSessions.startedAt, until),
          sql`${playSessions.startedAt} > ${new Date(until.getTime() - 56 * DAY)}`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        name: achievements.name,
        description: achievements.description,
        localized: achievements.localized,
        unlockedAt: userAchievements.unlockedAt,
      })
      .from(userAchievements)
      .innerJoin(
        achievementSets,
        and(
          eq(achievementSets.provider, userAchievements.provider),
          eq(achievementSets.gameKey, userAchievements.gameKey),
        ),
      )
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
          eq(achievementSets.gameId, row.game.id),
          lte(userAchievements.unlockedAt, until),
        ),
      )
      .orderBy(desc(userAchievements.unlockedAt))
      .limit(4),
  ]);

  const localize = (item: (typeof unlocked)[number]) =>
    (item.localized as Record<string, { name: string; description: string | null }> | null)?.[
      locale
    ] ?? {
      name: item.name,
      description: item.description,
    };

  return {
    row,
    daysAway: last ? Math.floor((Date.now() - last.getTime()) / DAY) : null,
    lastSession: sessions[0]
      ? { startedAt: sessions[0].startedAt.toISOString(), minutes: sessions[0].minutes }
      : null,
    sessionCount: sessions.length,
    weeks: weekly.map((week) => ({ weekStart: week.week, hours: hours(week.minutes) })),
    achievements: unlocked.map((item) => ({
      ...localize(item),
      unlockedAt: item.unlockedAt?.toISOString() ?? null,
    })),
    note: row.entry.review?.slice(0, 240) ?? null,
  };
}

/**
 * "Kaldığın yer": bir oyuna uzun aradan sonra dönen kullanıcıya son oturumları, o sıralar açtığı başarımları
 * ve kendi notunu hatırlatır; model bunlardan iki cümlelik bir hatırlatma yazar. Yalnızca kaydın sahibi
 * görür. Özet, dayandığı veri değişmedikçe önbellekten gelir.
 */
export async function entryRecap(userId: string, entryId: string, locale: string) {
  const data = await recapData(entryId, userId, locale);
  const { row } = data;
  const basis = [
    row.entry.lastPlayedAt?.toISOString() ?? "never",
    data.sessionCount,
    data.achievements.length,
    row.entry.review?.length ?? 0,
    locale,
  ].join("|");

  const base = {
    entryId,
    game: { ...briefOf(row.game), heroUrl: row.game.heroUrl, logoUrl: row.game.logoUrl },
    status: row.entry.status,
    daysAway: data.daysAway,
    lastSession: data.lastSession,
    weeks: data.weeks,
    achievements: data.achievements,
    note: data.note,
  };

  const [cached] = await db.select().from(aiRecaps).where(eq(aiRecaps.entryId, entryId));
  const cachedText = cached?.content as RecapText | undefined;
  // Model o an kullanılamadığı için özetsiz kaldıysa birkaç saat sonra yeniden denenir.
  const fresh =
    cachedText?.ai || (cached && Date.now() - cached.createdAt.getTime() < 6 * 60 * 60 * 1000);
  if (cached && cached.basis === basis && fresh) {
    const text = cached.content as RecapText;
    // Başlık gün sayısı içerdiği için her seferinde güncellenir; model özeti aynı kalır.
    return {
      ...base,
      headline: templateHeadline(data.daysAway, locale),
      summary: text.summary,
      ai: text.ai,
    };
  }

  const text = await writeRecap(userId, data, locale);
  await db
    .insert(aiRecaps)
    .values({ entryId, userId, basis, content: text, model: text.ai ? "light" : null })
    .onConflictDoUpdate({
      target: aiRecaps.entryId,
      set: { basis, content: text, createdAt: new Date() },
    });
  return {
    ...base,
    headline: templateHeadline(data.daysAway, locale),
    summary: text.summary,
    ai: text.ai,
  };
}

async function writeRecap(
  userId: string,
  data: Awaited<ReturnType<typeof recapData>>,
  locale: string,
): Promise<RecapText> {
  const fallback: RecapText = {
    headline: templateHeadline(data.daysAway, locale),
    summary: null,
    ai: false,
  };
  // Hatırlatacak veri yoksa model de bir şey uyduramaz.
  if (!data.achievements.length && !data.note && !data.lastSession) return fallback;
  let resolved: Awaited<ReturnType<typeof resolveModel>>;
  try {
    resolved = await resolveModel("light");
  } catch {
    return fallback;
  }
  if (resolved.id === "mock") return fallback;

  const language = locale === "tr" ? "Turkish" : "English";
  const startedAt = Date.now();
  try {
    const result = await generateText({
      model: resolved.model,
      maxRetries: 0,
      maxOutputTokens: 300,
      output: Output.object({ schema: z.object({ summary: z.string().max(320) }) }),
      prompt: [
        `A player is returning to "${data.row.game.name}"${data.daysAway !== null ? ` after ${data.daysAway} days` : ""}. Write a 1–2 sentence reminder in ${language}, addressing them as "you", of where they left off.`,
        "Use only the data below. Base progress on the achievements they unlocked most recently and on their own note. Never invent story events, and don't reveal anything beyond what these achievements already say.",
        `Last session: ${data.lastSession ? `${data.lastSession.startedAt.slice(0, 10)}, ${data.lastSession.minutes} minutes` : "unknown"}.`,
        data.achievements.length
          ? `Most recent achievements (newest first):\n${data.achievements.map((item) => `- ${item.name}${item.description ? `: ${item.description}` : ""}`).join("\n")}`
          : "No achievement data.",
        data.note ? `Their note: "${data.note}"` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    await recordRun({ userId, purpose: "recap", startedAt, steps: result.steps });
    return { headline: fallback.headline, summary: result.output.summary.trim() || null, ai: true };
  } catch (error) {
    logger.warn("ai", "recap_failed", `kaldığın yer özeti üretilemedi: ${errorMessageOf(error)}`, {
      userId,
    });
    await recordRun({ userId, purpose: "recap", startedAt, error }).catch(() => {});
    return fallback;
  }
}
