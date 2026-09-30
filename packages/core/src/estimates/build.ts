import { createHash } from "node:crypto";
import { schema } from "@my-games/db";
import type { EstimatePlan, EstimatePlanner } from "@my-games/shared";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { planWithAi } from "./ai";
import { dayOf, dayOfDate, hashSeed, isoOf } from "./days";
import { collectEvidence } from "./evidence";
import {
  anchorMap,
  certainDays,
  type Evidence,
  heuristicPlan,
  needsAi,
  planFromHint,
  userPlan,
} from "./planner";
import { type EntryDays, monthlyCapOf, reconcile, synthesize } from "./synthesize";

const { playEstimatePlans, playEstimateDays, playEstimateBuilds, libraryEntries } = schema;

/**
 * Üretici (planlayıcı, sentez) değiştiğinde artırılır: bütün kullanıcıların tahminleri arka planda yeniden
 * üretilir. Kullanıcının kendi girdiği planlar korunur, yalnızca günlere yeniden dağıtılır.
 */
export const GENERATOR_VERSION = 2;

type Planned = {
  evidence: Evidence;
  hash: string;
  plan: EstimatePlan;
  planner: EstimatePlanner;
  needsAi: boolean;
  model: string | null;
  /** Plan satırı yazılmalı. */
  changed: boolean;
};

const digest = (value: unknown) => createHash("sha1").update(JSON.stringify(value)).digest("hex");

/**
 * Planı belirleyen kanıtın özeti. Bütçe kaba bir kovaya indirgenir: süre biraz değişince (onay bekleyen
 * süre, elle küçük düzeltme) plan ve AI kararı korunur, yalnızca günler yeniden dağıtılır.
 */
function shapeHash({ budgetMin, ...rest }: Evidence) {
  return digest({ ...rest, budget: Math.round(Math.log2(Math.max(1, budgetMin / 60)) * 2) });
}

export type EstimateBuildStats = {
  entries: number;
  estimatedMin: number;
  days: number;
  heuristic: number;
  ai: number;
  user: number;
  excluded: number;
  /** AI'ya sorulacak ama henüz sorulamamış kayıtlar. */
  waitingAi: number;
  /** Gün tavanı yüzünden başka günlere taşınan dakika. */
  movedMin: number;
};

/**
 * Kullanıcının takipten önceki oynama geçmişini yeniden üretir. İdempotenttir: kanıt değişmediyse planlar
 * korunur (AI'ya tekrar gidilmez), planlar ve ritim de değişmediyse günler yeniden yazılmaz.
 */
export async function rebuildPlayEstimates(
  userId: string,
  options: {
    now?: Date;
    /** Planları kanıt değişmemiş olsa da yeniden kurar (AI ipuçları saklandığı yerden kullanılır). */
    force?: boolean;
    ai?: boolean;
    /** Saklanan AI ipuçlarını yok sayar, belirsiz oyunları AI'ya yeniden sorar. */
    askAgain?: boolean;
  } = {},
): Promise<EstimateBuildStats | null> {
  const now = options.now ?? new Date();
  // Derleme sırasında değişen kayıtlar bir sonraki derlemeye kalsın diye başlangıç anı yazılır.
  const builtAt = new Date();
  const [owner] = await db
    .select({ locale: schema.user.locale })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  if (!owner) return null;

  const { evidence, rhythm } = await collectEvidence(userId, now);
  const previous = new Map(
    (await db.select().from(playEstimatePlans).where(eq(playEstimatePlans.userId, userId))).map(
      (row) => [row.entryId, row],
    ),
  );

  const planned: Planned[] = evidence.map((item) => {
    const hash = shapeHash(item);
    const prev = previous.get(item.entryId);
    const budgetChanged = prev?.budgetMin !== item.budgetMin;
    if (prev?.planner === "user") {
      // Kullanıcının bilgisi AI'dan da kurallardan da önce gelir; yalnızca takip sonrasına taşan kısmı kırpılır.
      const plan = userPlan(
        item,
        { excluded: prev.plan.pattern === "excluded", periods: prev.plan.phases },
        isoOf(dayOfDate(now)),
        prev.plan,
      );
      if (plan) {
        return {
          evidence: item,
          hash,
          plan,
          planner: "user",
          needsAi: false,
          model: null,
          changed: budgetChanged || prev.evidenceHash !== hash,
        };
      }
    }
    if (
      prev &&
      !options.force &&
      !options.askAgain &&
      prev.evidenceHash === hash &&
      prev.generatorVersion === GENERATOR_VERSION
    ) {
      return {
        evidence: item,
        hash,
        plan: prev.plan,
        planner: prev.planner,
        needsAi: prev.needsAi,
        model: prev.model,
        changed: budgetChanged,
      };
    }
    // AI'nın oyun bilgisi kanıtla birlikte eskimez: yeni kanıtla plan saklanan ipucundan yeniden kurulur.
    const hint = options.askAgain ? undefined : prev?.plan.hint;
    if (hint) {
      return {
        evidence: item,
        hash,
        plan: planFromHint(item, hint),
        planner: "ai",
        needsAi: false,
        model: prev?.model ?? null,
        changed: true,
      };
    }
    const plan = heuristicPlan(item);
    return {
      evidence: item,
      hash,
      plan,
      planner: "heuristic",
      needsAi: needsAi(item, plan),
      model: null,
      changed: true,
    };
  });

  if (options.ai !== false) {
    // En çok süreyi taşıyan belirsiz oyunlar önce (bir derlemedeki AI çağrısı sınırlı).
    const targets = planned
      .filter((item) => item.needsAi)
      .sort((a, b) => b.evidence.budgetMin - a.evidence.budgetMin);
    const answer = await planWithAi(
      userId,
      targets.map((item) => item.evidence),
      owner.locale ?? "en",
    );
    for (const item of targets) {
      const plan = answer.plans.get(item.evidence.entryId);
      if (plan) {
        Object.assign(item, { plan, planner: "ai", needsAi: false, model: answer.model });
        item.changed = true;
      }
    }
  }

  const entries: EntryDays[] = planned
    .filter((item) => item.plan.pattern !== "excluded")
    .map((item) => {
      const window = item.plan.window ?? item.evidence.window;
      return {
        entryId: item.evidence.entryId,
        days: synthesize({
          budgetMin: item.evidence.budgetMin,
          window,
          phases: item.plan.phases,
          anchors: anchorMap(item.evidence),
          rhythm,
          seed: hashSeed(`${item.evidence.entryId}:${GENERATOR_VERSION}`),
        }),
        ranges: (item.plan.phases.length > 0 ? item.plan.phases : [window]).map(
          (phase) => [dayOf(phase.from), dayOf(phase.to)] as const,
        ),
        window: [dayOf(window.from), dayOf(window.to)] as const,
        fixed: certainDays(item.evidence),
        flexibility: item.plan.pattern === "steady" ? 2 : item.plan.pattern === "episodic" ? 1 : 0,
      };
    });
  const { moved } = reconcile(entries, {
    dailyCapMin: rhythm.dailyCapMin,
    monthlyCapMin: monthlyCapOf(rhythm),
  });

  const rows = entries.flatMap((entry) =>
    [...entry.days]
      .filter(([, minutes]) => minutes > 0)
      .map(([day, minutes]) => ({ entryId: entry.entryId, userId, day: isoOf(day), minutes })),
  );
  const count = (planner: EstimatePlanner) =>
    planned.filter((item) => item.planner === planner).length;
  const stats: EstimateBuildStats = {
    entries: planned.length,
    estimatedMin: rows.reduce((sum, row) => sum + row.minutes, 0),
    days: new Set(rows.map((row) => row.day)).size,
    heuristic: count("heuristic"),
    ai: count("ai"),
    user: count("user"),
    excluded: planned.filter((item) => item.plan.pattern === "excluded").length,
    waitingAi: planned.filter((item) => item.needsAi).length,
    movedMin: moved,
  };
  const buildHash = digest([
    GENERATOR_VERSION,
    rhythm,
    planned.map((item) => [item.evidence.entryId, item.evidence.budgetMin, item.hash, item.plan]),
  ]);

  await db.transaction(async (tx) => {
    // Aynı kullanıcının iki derlemesi (worker + CLI) günleri birbirinin üstüne yazmasın.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`estimates:${userId}`}))`);
    const kept = planned.map((item) => item.evidence.entryId);
    await tx
      .delete(playEstimatePlans)
      .where(
        and(
          eq(playEstimatePlans.userId, userId),
          kept.length ? notInArray(playEstimatePlans.entryId, kept) : undefined,
        ),
      );
    const changed = planned.filter((item) => item.changed || !previous.has(item.evidence.entryId));
    for (let index = 0; index < changed.length; index += 200) {
      await tx
        .insert(playEstimatePlans)
        .values(
          changed.slice(index, index + 200).map((item) => ({
            entryId: item.evidence.entryId,
            userId,
            budgetMin: item.evidence.budgetMin,
            windowFrom: item.evidence.window.from,
            windowTo: item.evidence.window.to,
            pattern: item.plan.pattern,
            plan: item.plan,
            confidence: item.plan.confidence,
            planner: item.planner,
            needsAi: item.needsAi,
            model: item.model,
            evidenceHash: item.hash,
            evidence: item.evidence,
            generatorVersion: GENERATOR_VERSION,
          })),
        )
        .onConflictDoUpdate({
          target: playEstimatePlans.entryId,
          set: Object.fromEntries(
            [
              "budget_min",
              "window_from",
              "window_to",
              "pattern",
              "plan",
              "confidence",
              "planner",
              "needs_ai",
              "model",
              "evidence_hash",
              "evidence",
              "generator_version",
            ].map((column) => [
              column.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase()),
              sql.raw(`excluded.${column}`),
            ]),
          ),
        });
    }

    const [build] = await tx
      .select({ hash: playEstimateBuilds.hash })
      .from(playEstimateBuilds)
      .where(eq(playEstimateBuilds.userId, userId));
    if (options.force || build?.hash !== buildHash) {
      await tx.delete(playEstimateDays).where(eq(playEstimateDays.userId, userId));
      for (let index = 0; index < rows.length; index += 2000) {
        await tx.insert(playEstimateDays).values(rows.slice(index, index + 2000));
      }
    }
    await tx
      .insert(playEstimateBuilds)
      .values({ userId, builtAt, generatorVersion: GENERATOR_VERSION, hash: buildHash, stats })
      .onConflictDoUpdate({
        target: playEstimateBuilds.userId,
        set: { builtAt, generatorVersion: GENERATOR_VERSION, hash: buildHash, stats },
      });
  });
  return stats;
}

/**
 * Tahmini güncellenmesi gereken kullanıcılar: hiç derlenmemiş, üretici sürümü eski ya da son derlemeden
 * sonra kütüphanesi, oturumları, ekran görüntüleri veya başarımları değişmiş olanlar. AI bekleyen planlar
 * altı saatte bir yeniden denenir.
 */
export async function usersNeedingEstimates(limit = 20) {
  const since = (table: string, column = "created_at") =>
    sql.raw(
      `exists (select 1 from ${table} x where x.user_id = u.id and x.${column} > b.built_at)`,
    );
  const rows = await db.execute<{ id: string }>(sql`
    select u.id from ${schema.user} u
    left join ${playEstimateBuilds} b on b.user_id = u.id
    where (b.user_id is null and exists (select 1 from ${libraryEntries} x where x.user_id = u.id))
      or b.generator_version < ${GENERATOR_VERSION}
      or ${since("library_entries", "updated_at")}
      or ${since("play_sessions")}
      or ${since("screenshots")}
      or ${since("user_achievements")}
      or (b.built_at < now() - interval '6 hours'
        and exists (select 1 from ${playEstimatePlans} x where x.user_id = u.id and x.needs_ai))
    order by b.built_at nulls first
    limit ${limit}
  `);
  return rows.rows.map((row) => row.id);
}
