import { schema } from "@my-games/db";
import { ratingFromStored } from "@my-games/shared";
import { generateText, Output } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { AppError } from "../errors";
import { errorMessageOf, logger } from "../log";
import { entryPlaytime } from "../playtime";
import { findUserByUsername } from "../users";
import { briefOf } from "./actions";
import { resolveModel } from "./models";
import { recordRun } from "./usage";

const { libraryEntries: e, games: g, gameTerms, terms } = schema;

export const pickInputSchema = z.object({
  time: z.enum(["short", "mid", "long"]),
  mood: z.enum(["relax", "story", "challenge", "strategy"]),
  /** Birlikte oynanacak kişi (kullanıcı adı). */
  with: z.string().min(1).max(40).optional(),
});
export type PickInput = z.infer<typeof pickInputSchema>;

/** IGDB tür/tema adları; ruh hâline uyan oyun biraz öne çıkar. */
const MOOD_TERMS: Record<PickInput["mood"], string[]> = {
  relax: [
    "simulator",
    "puzzle",
    "adventure",
    "indie",
    "sandbox",
    "open world",
    "survival",
    "casual",
    "exploration",
  ],
  story: [
    "role-playing (rpg)",
    "adventure",
    "visual novel",
    "point-and-click",
    "drama",
    "mystery",
    "narrative",
  ],
  challenge: [
    "platform",
    "fighting",
    "shooter",
    "hack and slash/beat 'em up",
    "arcade",
    "roguelike",
    "souls-like",
    "racing",
  ],
  strategy: [
    "strategy",
    "real time strategy (rts)",
    "turn-based strategy (tbs)",
    "tactical",
    "4x (explore, expand, exploit, and exterminate)",
    "simulator",
  ],
};
const MULTIPLAYER = [
  "multiplayer",
  "co-operative",
  "split screen",
  "massively multiplayer online (mmo)",
  "battle royale",
];

const DAY = 24 * 60 * 60 * 1000;
const hours = (minutes: number | null | undefined) => Math.round(((minutes ?? 0) / 60) * 10) / 10;

type Candidate = Awaited<ReturnType<typeof candidates>>[number];

async function candidates(userId: string, friendId: string | null) {
  const rows = await db
    .select({ entry: e, game: g, playtimeMin: entryPlaytime })
    .from(e)
    .innerJoin(g, eq(g.id, e.gameId))
    .where(and(eq(e.userId, userId), inArray(e.status, ["backlog", "paused", "playing"])));
  if (rows.length === 0) return [];
  const gameIds = rows.map((row) => row.game.id);
  const [termRows, friendRows] = await Promise.all([
    db
      .select({ gameId: gameTerms.gameId, kind: terms.kind, name: terms.name })
      .from(gameTerms)
      .innerJoin(terms, eq(terms.id, gameTerms.termId))
      .where(
        and(
          inArray(gameTerms.gameId, gameIds),
          inArray(terms.kind, ["genre", "theme", "game_mode"]),
        ),
      ),
    friendId
      ? db
          .select({ gameId: e.gameId })
          .from(e)
          .where(and(eq(e.userId, friendId), inArray(e.gameId, gameIds)))
      : Promise.resolve([]),
  ]);
  const termsByGame = new Map<string, { genres: string[]; modes: string[] }>();
  for (const row of termRows) {
    const bucket = termsByGame.get(row.gameId) ?? { genres: [], modes: [] };
    (row.kind === "game_mode" ? bucket.modes : bucket.genres).push(row.name);
    termsByGame.set(row.gameId, bucket);
  }
  const friendOwns = new Set(friendRows.map((row) => row.gameId));
  return rows.map((row) => ({
    ...row,
    genres: termsByGame.get(row.game.id)?.genres ?? [],
    modes: termsByGame.get(row.game.id)?.modes ?? [],
    friendOwns: friendOwns.has(row.game.id),
  }));
}

/** Kurallı puan: ruh hâli, süre, durum ve (varsa) birlikte oynanabilirlik. Model bu sıralamadan seçer. */
function score(candidate: Candidate, input: PickInput, withFriend: boolean) {
  const names = [...candidate.genres, ...candidate.modes].map((name) => name.toLowerCase());
  const multiplayer = names.some((name) => MULTIPLAYER.includes(name));
  if (withFriend && !multiplayer) return Number.NEGATIVE_INFINITY;
  let total = 0;
  total += MOOD_TERMS[input.mood].filter((term) => names.includes(term)).length * 2;
  const ttbHours = candidate.game.timeToBeatNormally
    ? candidate.game.timeToBeatNormally / 3600
    : null;
  if (input.time === "short") {
    if (multiplayer || names.includes("roguelike") || names.includes("arcade")) total += 2;
    if (ttbHours && ttbHours < 12) total += 1;
    if (ttbHours && ttbHours > 60) total -= 1;
  } else if (input.time === "long") {
    if (input.mood === "story" || input.mood === "strategy") total += 1;
  }
  if (candidate.entry.status === "playing") total += 1.5;
  if (candidate.entry.status === "paused") total += 1;
  if (candidate.friendOwns) total += 3;
  if (candidate.game.rating) total += candidate.game.rating / 50;
  return total;
}

function present(candidate: Candidate, reason: string) {
  return {
    entryId: candidate.entry.id,
    game: { ...briefOf(candidate.game), heroUrl: candidate.game.heroUrl },
    status: candidate.entry.status,
    hoursPlayed: hours(candidate.playtimeMin),
    hoursToBeat: candidate.game.timeToBeatNormally
      ? hours(candidate.game.timeToBeatNormally / 60)
      : null,
    rating: candidate.entry.rating === null ? null : ratingFromStored(candidate.entry.rating),
    lastPlayedAt: candidate.entry.lastPlayedAt?.toISOString() ?? null,
    genres: candidate.genres.slice(0, 3),
    reason,
  };
}

/** Model yoksa ya da cevap veremezse kullanılan kısa gerekçe. */
function templateReason(
  candidate: Candidate,
  input: PickInput,
  locale: string,
  friend: string | null,
) {
  const tr = locale === "tr";
  const days = candidate.entry.lastPlayedAt
    ? Math.floor((Date.now() - candidate.entry.lastPlayedAt.getTime()) / DAY)
    : null;
  if (friend && candidate.friendOwns) {
    return tr
      ? `İkinizin de kütüphanesinde var ve birlikte oynanabiliyor.`
      : `You both own it and it supports multiplayer.`;
  }
  if (candidate.entry.status === "playing" && days && days > 7) {
    return tr
      ? `${days} gündür açmadın; kaldığın yerden devam etmek için iyi bir akşam.`
      : `You haven't opened it in ${days} days — a good evening to pick it back up.`;
  }
  const genre = candidate.genres[0];
  const moods = {
    relax: tr ? "kafa dinlemek" : "unwinding",
    story: tr ? "hikâye" : "a story",
    challenge: tr ? "meydan okuma" : "a challenge",
    strategy: tr ? "strateji" : "strategy",
  } as const;
  return tr
    ? `${moods[input.mood][0]?.toUpperCase()}${moods[input.mood].slice(1)} istedin${genre ? `; ${genre} türünde, rafında bekliyor` : "; rafında bekliyor"}.`
    : `You wanted ${moods[input.mood]}${genre ? ` — it's ${genre} and waiting on your shelf` : " — it's waiting on your shelf"}.`;
}

/**
 * "Ne oynasam?": kullanıcının Oynanacak / Ara verildi / Oynanıyor oyunlarından üç öneri. Aday sıralaması
 * kurallarla yapılır, model en iyi sekizden üçünü seçip her birine tek cümlelik gerekçe yazar.
 */
export async function pickGames(userId: string, input: PickInput, locale: string) {
  const friend = input.with ? await findUserByUsername(input.with.replace(/^@/, "")) : null;
  if (input.with && !friend) throw new AppError("not_found", "Kullanıcı bulunamadı");
  const pool = (await candidates(userId, friend?.id ?? null))
    .map((candidate) => ({ candidate, score: score(candidate, input, !!friend) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.candidate);
  if (pool.length === 0) return { cards: [], ai: false };

  const fallback = () =>
    pool
      .slice(0, 3)
      .map((candidate) =>
        present(candidate, templateReason(candidate, input, locale, friend?.name ?? null)),
      );

  let resolved: Awaited<ReturnType<typeof resolveModel>>;
  try {
    resolved = await resolveModel("light");
  } catch {
    return { cards: fallback(), ai: false };
  }
  if (resolved.id === "mock") return { cards: fallback(), ai: false };

  const language = locale === "tr" ? "Turkish" : "English";
  const lines = pool.map((candidate) =>
    JSON.stringify({
      entryId: candidate.entry.id,
      name: candidate.game.name,
      status: candidate.entry.status,
      hoursPlayed: hours(candidate.playtimeMin),
      hoursToBeat: candidate.game.timeToBeatNormally
        ? hours(candidate.game.timeToBeatNormally / 60)
        : null,
      lastPlayedDaysAgo: candidate.entry.lastPlayedAt
        ? Math.floor((Date.now() - candidate.entry.lastPlayedAt.getTime()) / DAY)
        : null,
      genres: candidate.genres,
      modes: candidate.modes,
      friendOwnsIt: friend ? candidate.friendOwns : undefined,
    }),
  );
  const startedAt = Date.now();
  try {
    const result = await generateText({
      model: resolved.model,
      maxRetries: 0,
      maxOutputTokens: 600,
      output: Output.object({
        schema: z.object({
          picks: z
            .array(z.object({ entryId: z.string(), reason: z.string().max(220) }))
            .min(1)
            .max(3),
        }),
      }),
      prompt: [
        `Pick the 3 best games for this player to play tonight from the candidates below (their own library).`,
        `Tonight: time available = ${input.time === "short" ? "about 30 minutes" : input.time === "mid" ? "1–2 hours" : "the whole evening"}; mood = ${input.mood}${friend ? `; playing together with ${friend.name}` : "; playing alone"}.`,
        `For each pick write one short, concrete sentence in ${language}, addressing the player as "you", explaining why it fits tonight using the data (time, mood, how long since they played, hours). No invented facts. Order from best to third best.`,
        "Candidates (JSON lines):",
        ...lines,
      ].join("\n"),
    });
    await recordRun({ userId, purpose: "pick", startedAt, steps: result.steps });
    const byId = new Map(pool.map((candidate) => [candidate.entry.id, candidate]));
    const cards = result.output.picks
      .map((pick) => {
        const candidate = byId.get(pick.entryId);
        return candidate ? present(candidate, pick.reason.trim()) : null;
      })
      .filter((card): card is NonNullable<typeof card> => card !== null);
    if (cards.length === 0) return { cards: fallback(), ai: false };
    // Model üçten azını seçtiyse kalan yerler kurallı sıralamadan dolar.
    for (const candidate of pool) {
      if (cards.length >= 3) break;
      if (!cards.some((card) => card.entryId === candidate.entry.id)) {
        cards.push(
          present(candidate, templateReason(candidate, input, locale, friend?.name ?? null)),
        );
      }
    }
    return { cards, ai: true };
  } catch (error) {
    logger.warn("ai", "pick_failed", `ne oynasam önerisi üretilemedi: ${errorMessageOf(error)}`, {
      userId,
    });
    await recordRun({ userId, purpose: "pick", startedAt, error }).catch(() => {});
    return { cards: fallback(), ai: false };
  }
}
