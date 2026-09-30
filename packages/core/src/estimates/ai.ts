import type { EstimatePlan } from "@my-games/shared";
import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveModel } from "../ai/models";
import { recordRun } from "../ai/usage";
import { errorMessageOf, logger } from "../log";
import { type Evidence, planFromHint } from "./planner";

/** Bir çağrıda en fazla bu kadar oyun; bir derlemede en fazla bu kadar çağrı (kalanlar sonraki derlemeye). */
const BATCH_SIZE = 20;
const MAX_BATCHES = 6;

const hintSchema = z.object({
  games: z.array(
    z.object({
      key: z.string(),
      kind: z.enum(["tool", "short", "campaign", "long_running"]),
      releaseDate: z.string().nullable(),
      periods: z.array(z.object({ from: z.string(), to: z.string() })).max(5),
      confidence: z.number(),
      note: z.string().max(240),
    }),
  ),
});

export type AiPlanResult = {
  /** Kayıt → plan. Listede olmayan kayıtlar için AI kullanılamadı (sonra yeniden denenir). */
  plans: Map<string, EstimatePlan>;
  model: string | null;
};

const hours = (minutes: number) => `${Math.round(minutes / 6) / 10} h`;

function describe(key: string, evidence: Evidence) {
  const days = (items: Array<[string, number]>) =>
    items.length === 0
      ? "none"
      : items.length <= 12
        ? items.map(([day]) => day).join(", ")
        : `${items.length} days between ${items[0]?.[0]} and ${items.at(-1)?.[0]}; ${items
            .slice(-6)
            .map(([day]) => day)
            .join(", ")} most recently`;
  return [
    `[${key}] "${evidence.name}"`,
    `untracked playtime ${hours(evidence.budgetMin)}`,
    `window ${evidence.window.from}..${evidence.window.to}`,
    `status ${evidence.status}`,
    `released ${evidence.releaseDate ?? "unknown"}`,
    `time to beat ${evidence.ttbMin ? hours(evidence.ttbMin) : "unknown"}`,
    `genres ${evidence.genres.join(", ") || "unknown"}${evidence.multiplayer ? " (has multiplayer)" : ""}`,
    evidence.catalogued ? "" : "not in the game catalog",
    `started ${evidence.startedAt ?? "unknown"}`,
    `finished ${evidence.finishedAt ?? "no"}`,
    `last played ${evidence.lastPlayedAt ?? "unknown"}`,
    `added to library ${evidence.addedAt ?? "unknown"}`,
    `screenshot days: ${days(evidence.screenshots)}`,
    `achievement days: ${days(evidence.achievements)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Belirsiz kayıtlar için AI'nın oyun bilgisini ister: oyunun türü (araç mı, kampanya mı, yıllara yayılan mı),
 * gerçek çıkış tarihi ve saatlerin gittiği dönemler. Fazları bu ipuçlarıyla kural tabanlı planlayıcı kurar,
 * günlere dağıtım yine deterministik üreticidedir. AI yapılandırılmamışsa ya da hata verirse boş sonuç döner ve
 * kayıtlar kural tabanlı planla kalır.
 */
export async function planWithAi(
  userId: string,
  targets: readonly Evidence[],
  locale: string,
): Promise<AiPlanResult> {
  const result: AiPlanResult = { plans: new Map(), model: null };
  if (targets.length === 0) return result;
  let resolved: Awaited<ReturnType<typeof resolveModel>>;
  try {
    resolved = await resolveModel("light");
  } catch {
    return result;
  }
  // Geliştirme modeli yapılandırılmış plan üretemez.
  if (resolved.id === "mock") return result;
  result.model = resolved.id;
  const language = locale === "tr" ? 'Turkish (informal, "sen")' : "English";

  for (let batch = 0; batch < MAX_BATCHES && batch * BATCH_SIZE < targets.length; batch++) {
    const items = targets.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
    const keys = new Map(items.map((evidence, index) => [`g${index + 1}`, evidence]));
    const startedAt = Date.now();
    try {
      const response = await generateText({
        model: resolved.model,
        maxRetries: 0,
        maxOutputTokens: 6000,
        output: Output.object({ schema: hintSchema }),
        prompt: [
          "You help reconstruct a player's gaming history from before their playtime was tracked. Code places the hours on calendar days; you contribute what you know about each game and what its evidence suggests. For each game below return:",
          "- kind: tool = not really gameplay (utilities like upscalers, FPS or overlay tools, benchmarks, idle farming; these hours are left out); short = a few sessions; campaign = played through once or a few times, mostly in one period; long_running = played for months or years (multiplayer, grand strategy, MMO, sandbox, yearly sports series).",
          "- releaseDate: the game's first release date (YYYY-MM-DD, early access counts) if you are confident, else null. Especially important when ours is unknown.",
          "- periods: up to 5 date ranges (YYYY-MM-DD) inside the window when most of the hours most likely went: the main run, and returns for big expansions, DLC or updates whose dates you know. Evidence days (finished, last played, screenshots, achievements) are real days they played; a finished game's main run ends on the finish date. Return an empty list when you have no real basis — don't guess.",
          "- confidence 0–1: how sure you are about when the hours went.",
          `- note: one short sentence in ${language} for the player about when they probably played it, addressing them as "you". Don't repeat the numbers.`,
          "Games:",
          ...[...keys].map(([key, evidence]) => describe(key, evidence)),
        ].join("\n"),
      });
      await recordRun({ userId, purpose: "estimates", startedAt, steps: response.steps });
      for (const item of response.output.games) {
        const evidence = keys.get(item.key);
        if (!evidence) continue;
        const { key: _key, ...hint } = item;
        result.plans.set(
          evidence.entryId,
          planFromHint(evidence, { ...hint, note: hint.note || null }),
        );
      }
    } catch (error) {
      logger.warn(
        "ai",
        "estimates_failed",
        `geçmiş tahmini planlanamadı: ${errorMessageOf(error)}`,
        {
          userId,
        },
      );
      await recordRun({ userId, purpose: "estimates", startedAt, error }).catch(() => {});
      // Kota/hata: kalan gruplar da büyük ihtimalle başarısız olur; sonraki derlemede yeniden denenir.
      break;
    }
  }
  return result;
}
