import { schema } from "@my-games/db";
import { generateText } from "ai";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { notFound } from "../errors";
import { errorMessageOf, logger } from "../log";
import { entryPlaytime } from "../playtime";
import { resolveModel } from "./models";
import { recordRun } from "./usage";

const { libraryEntries: e, games: g } = schema;

export const reviewStrengths = [
  "gameplay",
  "combat",
  "story",
  "characters",
  "atmosphere",
  "world",
  "music",
  "visuals",
  "side_content",
] as const;
export const reviewWeaknesses = [
  "choices",
  "bugs",
  "performance",
  "pacing",
  "repetition",
  "difficulty",
  "length",
  "none",
] as const;

export const reviewDraftSchema = z.object({
  entryId: z.uuid(),
  rating: z.number().min(0).max(10).nullable().optional(),
  strengths: z.array(z.enum(reviewStrengths)).max(reviewStrengths.length).default([]),
  weaknesses: z.array(z.enum(reviewWeaknesses)).max(reviewWeaknesses.length).default([]),
  note: z.string().trim().max(300).optional(),
});
export type ReviewDraftInput = z.infer<typeof reviewDraftSchema>;

const EN = {
  strengths: {
    gameplay: "the gameplay",
    combat: "the combat",
    story: "the story",
    characters: "the characters",
    atmosphere: "the atmosphere",
    world: "the world",
    music: "the music",
    visuals: "the visuals",
    side_content: "the side content",
  },
  weaknesses: {
    choices: "choices that barely change the outcome",
    bugs: "the bugs",
    performance: "the performance",
    pacing: "the pacing",
    repetition: "the repetition",
    difficulty: "the difficulty",
    length: "the length",
    none: "",
  },
} as const;

/** Türkçe şablon: iyelik ekli hâller ("atmosferi", "hikâyesi"). */
const TR = {
  strengths: {
    gameplay: "oynanışı",
    combat: "combat'ı",
    story: "hikâyesi",
    characters: "karakterleri",
    atmosphere: "atmosferi",
    world: "dünyası",
    music: "müzikleri",
    visuals: "görselliği",
    side_content: "yan içerikleri",
  },
  weaknesses: {
    choices: "seçimlerin sonuca pek etki etmemesi",
    bugs: "hâlâ karşılaşılan hatalar",
    performance: "performans sorunları",
    pacing: "temposu",
    repetition: "kendini tekrar etmesi",
    difficulty: "zorluk ayarı",
    length: "süresi",
    none: "",
  },
} as const;

function join(items: string[], and: string) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1)}`;
}

function capitalize(text: string, locale: string) {
  return text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;
}

/** Model yoksa: seçimlerden kurulan sade bir taslak (kullanıcı zaten düzenleyecek). */
export function templateReview(input: ReviewDraftInput, hoursPlayed: number, locale: string) {
  const tr = locale === "tr";
  const words = tr ? TR : EN;
  const out: string[] = [];
  if (input.note) out.push(`${capitalize(input.note.replace(/[.!\s]+$/, ""), locale)}.`);
  const good = input.strengths.map((key) => words.strengths[key]);
  const bad = input.weaknesses.filter((key) => key !== "none").map((key) => words.weaknesses[key]);
  if (tr) {
    const weak = bad.length
      ? `${bad.length === 1 ? "en büyük eksiği" : "eksikleri ise"} ${join(bad, "ve")}`
      : "";
    if (good.length)
      out.push(`${capitalize(join(good, "ve"), locale)} çok başarılı${weak ? `; ${weak}` : ""}.`);
    else if (weak) out.push(`${capitalize(weak, locale)}.`);
    if (input.weaknesses.includes("none") && !bad.length)
      out.push("Aklıma gelen ciddi bir eksiği yok.");
    if (hoursPlayed > 0) out.push(`${hoursPlayed.toLocaleString("tr-TR")} saatte bitirdim.`);
    if ((input.rating ?? 0) >= 9) out.push("Gönül rahatlığıyla öneririm.");
  } else {
    if (good.length)
      out.push(
        `${capitalize(join(good, "and"), locale)} ${good.length > 1 ? "are" : "is"} excellent.`,
      );
    if (bad.length)
      out.push(
        `${bad.length === 1 ? "The biggest weakness is" : "The weaknesses are"} ${join(bad, "and")}.`,
      );
    if (input.weaknesses.includes("none") && !bad.length)
      out.push("I can't think of a real weakness.");
    if (hoursPlayed > 0) out.push(`Finished it in ${hoursPlayed} hours.`);
    if ((input.rating ?? 0) >= 9) out.push("Easy recommendation.");
  }
  return out.join(" ");
}

/**
 * Oyun sonrası röportajın taslağı. Kullanıcının seçimleri, oynama verisi ve daha önce yazdığı incelemelerden
 * birkaçı (üslubunu tutturmak için) modele verilir. Taslak yalnızca önerilir; yayımlamak kullanıcıdadır.
 */
export async function draftReview(userId: string, input: ReviewDraftInput, locale: string) {
  const [row] = await db
    .select({ entry: e, game: g, playtimeMin: entryPlaytime })
    .from(e)
    .innerJoin(g, eq(g.id, e.gameId))
    .where(eq(e.id, input.entryId));
  if (!row || row.entry.userId !== userId) notFound("Kayıt bulunamadı");
  const hoursPlayed = Math.round((row.playtimeMin / 60) * 10) / 10;
  const fallback = () => ({ draft: templateReview(input, hoursPlayed, locale), ai: false });

  let resolved: Awaited<ReturnType<typeof resolveModel>>;
  try {
    resolved = await resolveModel("light");
  } catch {
    return fallback();
  }
  if (resolved.id === "mock") return fallback();

  const samples = await db
    .select({ name: g.name, review: e.review })
    .from(e)
    .innerJoin(g, eq(g.id, e.gameId))
    .where(and(eq(e.userId, userId), isNotNull(e.review), ne(e.id, input.entryId)))
    .orderBy(desc(sql`length(${e.review})`))
    .limit(3);
  const language = locale === "tr" ? "Turkish" : "English";
  const startedAt = Date.now();
  try {
    const result = await generateText({
      model: resolved.model,
      maxRetries: 0,
      maxOutputTokens: 400,
      prompt: [
        `Write a short game review (2–4 sentences, at most 450 characters) in ${language}, in the first person, as the player below would write it. Plain text, no title, no rating number, no emojis.`,
        `Game: ${row.game.name}. They finished it with ${hoursPlayed} hours played${input.rating != null ? ` and rated it ${input.rating}/10` : ""}.`,
        input.strengths.length
          ? `What they liked most: ${input.strengths.map((key) => EN.strengths[key]).join(", ")}.`
          : "",
        input.weaknesses.filter((key) => key !== "none").length
          ? `What they missed: ${input.weaknesses
              .filter((key) => key !== "none")
              .map((key) => EN.weaknesses[key])
              .join(", ")}.`
          : input.weaknesses.includes("none")
            ? "They found no real weakness."
            : "",
        input.note
          ? `Their own sentence (keep its meaning, you may polish it): "${input.note}"`
          : "",
        samples.length
          ? `Match the tone and style of their earlier reviews:\n${samples.map((sample) => `- ${sample.name}: ${sample.review?.slice(0, 400)}`).join("\n")}`
          : "",
        "Don't invent plot details or facts that aren't given.",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    await recordRun({ userId, purpose: "review", startedAt, steps: result.steps });
    const draft = result.text.trim();
    return draft ? { draft, ai: true } : fallback();
  } catch (error) {
    logger.warn("ai", "review_failed", `inceleme taslağı üretilemedi: ${errorMessageOf(error)}`, {
      userId,
    });
    await recordRun({ userId, purpose: "review", startedAt, error }).catch(() => {});
    return fallback();
  }
}
