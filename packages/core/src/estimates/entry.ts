import { schema } from "@my-games/db";
import type { EstimatePlan, EstimatePlanner } from "@my-games/shared";
import { gameCoverUrl } from "@my-games/shared";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { rebuildPlayEstimates } from "./build";
import { dayOfDate, isoOf } from "./days";
import {
  AI_MIN_BUDGET_MIN,
  type EstimateAnswer,
  type Evidence,
  heuristicPlan,
  planFromAnswer,
  type UserPeriods,
  userLimits,
  userPlan,
} from "./planner";

const { libraryEntries, games, playEstimatePlans, playEstimateDays, playSessions } = schema;

export type EntryPlayHistory = {
  /** Takipten önceki süre için plan; tahmin edilecek süre yoksa `null`. */
  estimate: {
    budgetMin: number;
    pattern: EstimatePlan["pattern"];
    planner: EstimatePlanner;
    confidence: number;
    note: string | null;
    phases: EstimatePlan["phases"];
    /** Düzeltmede seçilebilecek tarihler (takip başlamadan önce). */
    limits: { from: string; to: string };
  } | null;
  /** Ay başına süre (`YYYY-MM`); `estimatedMinutes` takipten önceki tahmin olan kısım. */
  months: Array<{ month: string; minutes: number; estimatedMinutes: number }>;
};

const today = () => isoOf(dayOfDate(new Date()));

/** Kaydın oynama geçmişi: gerçek oturumlar ve tahmin, ay ay; tahminin nereden geldiği. Herkese açık. */
export async function entryPlayHistory(entryId: string): Promise<EntryPlayHistory> {
  const [entry] = await db
    .select({ userId: libraryEntries.userId, gameId: libraryEntries.gameId })
    .from(libraryEntries)
    .where(eq(libraryEntries.id, entryId));
  if (!entry) notFound("Kayıt bulunamadı", "entry_not_found");
  const [[plan], months] = await Promise.all([
    db.select().from(playEstimatePlans).where(eq(playEstimatePlans.entryId, entryId)),
    db.execute<{ month: string; minutes: number; estimatedMinutes: number }>(sql`
      select month, sum(minutes)::int as minutes, sum(estimated)::int as "estimatedMinutes"
      from (
        select to_char(${playSessions.endedAt}, 'YYYY-MM') as month, ${playSessions.durationMin} as minutes,
          0 as estimated
        from ${playSessions}
        where ${playSessions.userId} = ${entry.userId} and ${playSessions.gameId} = ${entry.gameId}
        union all
        select to_char(${playEstimateDays.day}, 'YYYY-MM'), ${playEstimateDays.minutes}, ${playEstimateDays.minutes}
        from ${playEstimateDays} where ${playEstimateDays.entryId} = ${entryId}
      ) plays
      group by 1 order by 1
    `),
  ]);
  return {
    estimate: plan
      ? {
          budgetMin: plan.budgetMin,
          pattern: plan.pattern,
          planner: plan.planner,
          confidence: plan.confidence,
          note: plan.plan.note ?? null,
          phases: plan.plan.phases,
          limits: userLimits(plan.evidence as Evidence, today()),
        }
      : null,
    months: months.rows,
  };
}

async function ownedPlan(userId: string, entryId: string) {
  const [row] = await db
    .select({ owner: libraryEntries.userId, plan: playEstimatePlans })
    .from(libraryEntries)
    .leftJoin(playEstimatePlans, eq(playEstimatePlans.entryId, libraryEntries.id))
    .where(eq(libraryEntries.id, entryId));
  if (!row) notFound("Kayıt bulunamadı", "entry_not_found");
  if (row.owner !== userId) forbidden();
  if (!row.plan) {
    throw new AppError("invalid", "Bu kaydın takipten önceki süresi yok", "estimate_missing");
  }
  return row.plan;
}

/** Kullanıcı planını kaydeder (`user` olarak kilitli: AI ve kurallar bir daha değiştirmez) ve günleri dağıtır. */
async function saveUserPlan(
  userId: string,
  entryId: string,
  current: typeof playEstimatePlans.$inferSelect,
  plan: EstimatePlan | null,
) {
  if (!plan) {
    throw new AppError(
      "invalid",
      "Takip başlamadan önceki bir dönem seçilmeli",
      "estimate_periods",
    );
  }
  await db
    .update(playEstimatePlans)
    .set({
      plan,
      pattern: plan.pattern,
      confidence: plan.confidence,
      planner: "user",
      needsAi: false,
      windowFrom: plan.window?.from ?? current.windowFrom,
      windowTo: plan.window?.to ?? current.windowTo,
    })
    .where(and(eq(playEstimatePlans.entryId, entryId), eq(playEstimatePlans.userId, userId)));
  await rebuildPlayEstimates(userId, { ai: false });
  return entryPlayHistory(entryId);
}

/** Kullanıcının ayrıntılı "ne zaman oynadım" düzeltmesi (dönemler ve yoğunlukları). */
export async function setEntryPlayHistory(userId: string, entryId: string, input: UserPeriods) {
  const current = await ownedPlan(userId, entryId);
  const plan = userPlan(current.evidence as Evidence, input, today(), current.plan);
  return saveUserPlan(userId, entryId, current, plan);
}

/** Hızlı soru destesinin cevabı ("bir kerede, 2012 Temmuz", "şu yıllarda", "oyun değil", "tahmin doğru"). */
export async function answerPlayHistory(userId: string, entryId: string, answer: EstimateAnswer) {
  const current = await ownedPlan(userId, entryId);
  const plan = planFromAnswer(current.evidence as Evidence, answer, today(), current.plan);
  return saveUserPlan(userId, entryId, current, plan);
}

/** Destede sorulacak en fazla oyun. */
const QUESTION_LIMIT = 12;
/** Kanıtı bundan güçlü oyunlar sorulmaz (ör. bitirme tarihi + birkaç günlük ekran görüntüsü). */
const QUESTION_MAX_CERTAINTY = 0.6;

/**
 * Kullanıcıya sorulmaya değer oyunlar: çok saatli ve kanıtı az olanlar (öncelik = süre × (1 − kanıt güveni)).
 * Güven kanıttan yeniden hesaplanır; AI'nın kendi söylediği güvene bakılmaz (çoğu zaman fazla iyimser).
 * Kullanıcının zaten cevapladığı oyunlar sorulmaz.
 */
export async function estimateQuestions(userId: string) {
  const rows = await db
    .select({
      entryId: playEstimatePlans.entryId,
      budgetMin: playEstimatePlans.budgetMin,
      planner: playEstimatePlans.planner,
      plan: playEstimatePlans.plan,
      evidence: playEstimatePlans.evidence,
      game: {
        name: games.name,
        coverImageId: games.coverImageId,
        coverUrl: games.coverUrl,
      },
    })
    .from(playEstimatePlans)
    .innerJoin(libraryEntries, eq(libraryEntries.id, playEstimatePlans.entryId))
    .innerJoin(games, eq(games.id, libraryEntries.gameId))
    .where(
      and(
        eq(playEstimatePlans.userId, userId),
        ne(playEstimatePlans.planner, "user"),
        gte(playEstimatePlans.budgetMin, AI_MIN_BUDGET_MIN),
      ),
    );
  const scored = rows
    .map((row) => {
      const evidence = row.evidence as Evidence;
      const certainty = heuristicPlan(evidence).confidence;
      return { row, evidence, certainty, priority: row.budgetMin * (1 - certainty) };
    })
    .filter((item) => item.certainty < QUESTION_MAX_CERTAINTY)
    .sort((a, b) => b.priority - a.priority || a.row.entryId.localeCompare(b.row.entryId));
  return {
    total: scored.length,
    questions: scored.slice(0, QUESTION_LIMIT).map(({ row, evidence }) => {
      const limits = userLimits(evidence, today());
      const phases = row.plan.phases;
      const release = row.plan.hint?.releaseDate ?? evidence.releaseDate ?? evidence.window.from;
      const lastYear = Number(limits.to.slice(0, 4));
      return {
        entryId: row.entryId,
        game: { name: row.game.name, coverUrl: gameCoverUrl(row.game, "cover_small") },
        budgetMin: row.budgetMin,
        pattern: row.plan.pattern,
        planner: row.planner,
        note: row.plan.note ?? null,
        /** Mevcut tahminin kapsadığı aralık. */
        guess:
          phases.length > 0
            ? {
                from: phases.reduce(
                  (min, phase) => (phase.from < min ? phase.from : min),
                  limits.to,
                ),
                to: phases.reduce((max, phase) => (phase.to > max ? phase.to : max), limits.from),
              }
            : null,
        /** Seçilebilecek yıllar (çıkıştan takip başlangıcına). */
        years: {
          from: Math.min(lastYear, Math.max(1995, Number(release.slice(0, 4)))),
          to: lastYear,
        },
      };
    }),
  };
}

/**
 * Düzeltmeyi bırakıp tahmine döner. Saklanan AI ipucu varsa plan ondan kurulur; yoksa kurallardan (belirsizse
 * AI'ya worker sorar).
 */
export async function resetEntryPlayHistory(userId: string, entryId: string) {
  const current = await ownedPlan(userId, entryId);
  if (current.planner === "user") {
    await db
      .update(playEstimatePlans)
      // Boş özet planı yeniden kurdurur; ipucu `plan.hint`'te kalır.
      .set({ planner: current.plan.hint ? "ai" : "heuristic", evidenceHash: "" })
      .where(eq(playEstimatePlans.entryId, entryId));
    await rebuildPlayEstimates(userId, { ai: false });
  }
  return entryPlayHistory(entryId);
}
