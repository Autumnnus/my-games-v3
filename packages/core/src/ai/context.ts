import { schema } from "@my-games/db";
import { entryStatuses, ratingFromStored } from "@my-games/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { entryPlaytime } from "../playtime";
import { findUserByUsername } from "../users";

const { games, libraryEntries, user } = schema;

/** Kullanıcının asistanı açtığı sayfa (istemci yönlendiriciden türetir, sunucu doğrular). */
export const pageContextSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("game"), slug: z.string().min(1).max(200) }),
  z.object({ type: z.literal("entry"), id: z.uuid() }),
  z.object({ type: z.literal("profile"), username: z.string().min(1).max(40) }),
  z.object({ type: z.literal("stats") }),
  z.object({ type: z.literal("inbox") }),
  z.object({ type: z.literal("home") }),
]);
export type PageContext = z.infer<typeof pageContextSchema>;

const label = z.string().trim().min(1).max(120);

/** Mesajda `@` ile etiketlenenler. Etiket yalnızca gösterim içindir; sunucu kimlikten yeniden çözer. */
export const mentionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("game"), gameId: z.uuid(), label }),
  z.object({ type: z.literal("user"), username: z.string().min(1).max(40), label }),
  z.object({ type: z.literal("status"), status: z.enum(entryStatuses), label }),
  z.object({ type: z.literal("year"), year: z.number().int().min(1970).max(2100), label }),
]);
export type Mention = z.infer<typeof mentionSchema>;

/** `/` komutları. Bazıları sohbet dışı akış açar (istemcide); sohbete gelenler modele ipucu olur. */
export const assistantCommands = [
  "pick",
  "compare",
  "recap",
  "summary",
  "review",
  "status",
  "inbox",
] as const;
export type AssistantCommand = (typeof assistantCommands)[number];

export const assistantModes = ["ask", "act"] as const;
export type AssistantMode = (typeof assistantModes)[number];

export const userMessageMetadataSchema = z
  .object({
    mode: z.enum(assistantModes).optional(),
    page: pageContextSchema.optional(),
    mentions: z.array(mentionSchema).max(8).optional(),
    command: z.enum(assistantCommands).optional(),
    createdAt: z.number().optional(),
  })
  .strict();
export type UserMessageMetadata = z.infer<typeof userMessageMetadataSchema>;

/** Modele verilecek, doğrulanmış bağlam. */
export type ResolvedContext = {
  /** Prompta giren satırlar. */
  lines: string[];
  /** Sayfanın oyunu (sohbet listesinde kapak, başlıkta renk). */
  gameId: string | null;
};

const hours = (minutes: number | null | undefined) => Math.round(((minutes ?? 0) / 60) * 10) / 10;

async function describeGame(currentUserId: string, gameId: string) {
  const [row] = await db
    .select({
      id: games.id,
      name: games.name,
      entryId: libraryEntries.id,
      status: libraryEntries.status,
      rating: libraryEntries.rating,
      playtimeMin: entryPlaytime,
    })
    .from(games)
    .leftJoin(
      libraryEntries,
      and(eq(libraryEntries.gameId, games.id), eq(libraryEntries.userId, currentUserId)),
    )
    .where(eq(games.id, gameId));
  if (!row) return null;
  const entry = row.entryId
    ? `In the user's library: entryId ${row.entryId}, status ${row.status}` +
      `${row.rating !== null ? `, rating ${ratingFromStored(row.rating)}` : ""}` +
      `, ${hours(row.playtimeMin)} h played.`
    : "Not in the user's library.";
  return { id: row.id, name: row.name, text: `"${row.name}" (gameId ${row.id}). ${entry}` };
}

async function describeUser(username: string) {
  const found = await findUserByUsername(username.replace(/^@/, ""));
  if (!found) return null;
  return `@${found.displayUsername ?? found.username} (${found.name})`;
}

/**
 * Sayfa bağlamını ve etiketleri veritabanından doğrular ve prompt satırlarına çevirir. Var olmayan ya da
 * erişilemeyen şeyler sessizce atlanır (istemciden gelen kimliklere güvenilmez).
 */
export async function resolveContext(
  currentUserId: string,
  metadata: UserMessageMetadata | undefined,
): Promise<ResolvedContext> {
  const lines: string[] = [];
  let gameId: string | null = null;
  const page = metadata?.page;

  if (page?.type === "game") {
    const [game] = await db.select({ id: games.id }).from(games).where(eq(games.slug, page.slug));
    const described = game ? await describeGame(currentUserId, game.id) : null;
    if (described) {
      gameId = described.id;
      lines.push(
        `The user opened the assistant on the page of the game ${described.text} "This game" / "bu oyun" means it.`,
      );
    }
  } else if (page?.type === "entry") {
    const [entry] = await db
      .select({
        gameId: libraryEntries.gameId,
        userId: libraryEntries.userId,
        ownerName: user.name,
        ownerUsername: user.displayUsername,
      })
      .from(libraryEntries)
      .innerJoin(user, eq(user.id, libraryEntries.userId))
      .where(eq(libraryEntries.id, page.id));
    const described = entry ? await describeGame(currentUserId, entry.gameId) : null;
    if (entry && described) {
      gameId = described.id;
      lines.push(
        entry.userId === currentUserId
          ? `The user opened the assistant on their own library entry for ${described.text} "This game" / "bu oyun" means it.`
          : `The user is looking at @${entry.ownerUsername} (${entry.ownerName})'s entry for ${described.text}`,
      );
    }
  } else if (page?.type === "profile") {
    const described = await describeUser(page.username);
    if (described) lines.push(`The user is looking at the profile and library of ${described}.`);
  } else if (page?.type === "stats") {
    lines.push("The user is on their statistics page.");
  } else if (page?.type === "inbox") {
    lines.push("The user is on their approval inbox (pending sync proposals).");
  }

  const mentions: string[] = [];
  for (const mention of metadata?.mentions ?? []) {
    if (mention.type === "game") {
      const described = await describeGame(currentUserId, mention.gameId);
      if (described) mentions.push(`Game ${described.text}`);
    } else if (mention.type === "user") {
      const described = await describeUser(mention.username);
      if (described) mentions.push(`User ${described}`);
    } else if (mention.type === "status") {
      mentions.push(`Status filter: ${mention.status}`);
    } else if (mention.type === "year") {
      mentions.push(`Year: ${mention.year}`);
    }
  }
  if (mentions.length) {
    lines.push(
      "The user tagged these in their latest message (use the ids):",
      ...mentions.map((item) => `- ${item}`),
    );
  }

  const command = metadata?.command;
  if (command) lines.push(COMMAND_HINTS[command]);
  return { lines, gameId };
}

const COMMAND_HINTS: Record<AssistantCommand, string> = {
  pick: "The user used /pick: suggest what to play next from their backlog (suggestFromBacklog).",
  compare:
    "The user used /compare: compare what they tagged (two games with getGame, or their library with a user via compareWithUser).",
  recap:
    "The user used /recap: summarise where they left off in the tagged game (getPlayHistory, getAchievements).",
  summary:
    "The user used /summary: summarise the tagged year or their recent activity (getStats, getPlayHistory).",
  review: "The user used /review: help them write a short review of the tagged game.",
  status: "The user used /status: they want to change a game's status, rating or playtime.",
  inbox: "The user used /inbox: show and help resolve their pending approvals (listInbox).",
};
