import { schema } from "@my-games/db";
import type { SocialTarget } from "@my-games/shared";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { type EventPayload, emit } from "../events";
import { notify } from "./notifications";

const { reactions, comments, activities, libraryEntries, screenshots, user, games } = schema;

const MAX_COMMENT_LENGTH = 2000;
const MAX_MENTIONS = 5;

/** Beğeni/yorum hedefinin sahibi ve bildirimde gösterilecek oyun. Hedef yoksa `null`. */
export async function resolveTarget(
  tx: Tx | typeof db,
  targetType: SocialTarget,
  targetId: string,
) {
  if (targetType === "activity") {
    const [row] = await tx
      .select({
        ownerId: activities.actorId,
        gameId: activities.gameId,
        entryId: activities.entryId,
      })
      .from(activities)
      .where(eq(activities.id, targetId));
    return row ?? null;
  }
  if (targetType === "entry") {
    const [row] = await tx
      .select({
        ownerId: libraryEntries.userId,
        gameId: libraryEntries.gameId,
        entryId: libraryEntries.id,
      })
      .from(libraryEntries)
      .where(eq(libraryEntries.id, targetId));
    return row ?? null;
  }
  const [row] = await tx
    .select({
      ownerId: screenshots.userId,
      gameId: screenshots.gameId,
      entryId: screenshots.entryId,
    })
    .from(screenshots)
    .where(eq(screenshots.id, targetId));
  return row ?? null;
}

async function gameName(tx: Tx, gameId: string | null) {
  if (!gameId) return null;
  const [row] = await tx.select({ name: games.name }).from(games).where(eq(games.id, gameId));
  return row?.name ?? null;
}

// --- Beğeni ---

export async function react(userId: string, targetType: SocialTarget, targetId: string) {
  await db.transaction(async (tx) => {
    const target = await resolveTarget(tx, targetType, targetId);
    if (!target) notFound("İçerik bulunamadı", "content_not_found");
    const inserted = await tx
      .insert(reactions)
      .values({ userId, targetType, targetId })
      .onConflictDoNothing()
      .returning({ userId: reactions.userId });
    if (inserted.length) await emit(tx, "reaction.created", { userId, targetType, targetId });
  });
  return reactionSummary(targetType, targetId, userId);
}

export async function unreact(userId: string, targetType: SocialTarget, targetId: string) {
  await db
    .delete(reactions)
    .where(
      and(
        eq(reactions.userId, userId),
        eq(reactions.targetType, targetType),
        eq(reactions.targetId, targetId),
      ),
    );
  return reactionSummary(targetType, targetId, userId);
}

export async function reactionSummary(
  targetType: SocialTarget,
  targetId: string,
  viewerId?: string | null,
) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      viewerReacted: viewerId
        ? sql<boolean>`coalesce(bool_or(${reactions.userId} = ${viewerId}), false)`
        : sql<boolean>`false`,
    })
    .from(reactions)
    .where(and(eq(reactions.targetType, targetType), eq(reactions.targetId, targetId)));
  return row ?? { count: 0, viewerReacted: false };
}

// --- Yorum ---

export function extractMentions(body: string) {
  const names = new Set<string>();
  for (const match of body.matchAll(/(?:^|[^\w@])@([a-z0-9_.]{3,30})/gi)) {
    if (match[1]) names.add(match[1].toLowerCase().replace(/\.+$/, ""));
  }
  return [...names].slice(0, MAX_MENTIONS);
}

export async function addComment(
  authorId: string,
  input: { targetType: SocialTarget; targetId: string; body: string; parentId?: string | null },
) {
  const body = input.body.trim();
  if (!body) throw new AppError("invalid", "Yorum boş olamaz", "comment_empty");
  if (body.length > MAX_COMMENT_LENGTH)
    throw new AppError("invalid", "Yorum çok uzun", "comment_too_long");

  return db.transaction(async (tx) => {
    const target = await resolveTarget(tx, input.targetType, input.targetId);
    if (!target) notFound("İçerik bulunamadı", "content_not_found");

    // Tek seviye yanıt: yanıtın yanıtı kök yoruma bağlanır.
    let parentId: string | null = null;
    if (input.parentId) {
      const [parent] = await tx.select().from(comments).where(eq(comments.id, input.parentId));
      if (!parent || parent.targetId !== input.targetId || parent.deletedAt)
        notFound("Yanıtlanan yorum yok", "comment_not_found");
      parentId = parent.parentId ?? parent.id;
    }

    const mentionNames = extractMentions(body);
    const mentioned = mentionNames.length
      ? await tx.select({ id: user.id }).from(user).where(inArray(user.username, mentionNames))
      : [];

    const [comment] = await tx
      .insert(comments)
      .values({ targetType: input.targetType, targetId: input.targetId, authorId, parentId, body })
      .returning();
    if (!comment) throw new AppError("conflict");
    await emit(tx, "comment.created", {
      commentId: comment.id,
      authorId,
      targetType: input.targetType,
      targetId: input.targetId,
      parentId,
      replyToId: input.parentId ?? null,
      mentions: mentioned.map((row) => row.id).filter((id) => id !== authorId),
    });
    return comment;
  });
}

export async function listComments(targetType: SocialTarget, targetId: string) {
  const rows = await db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      body: comments.body,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      deletedAt: comments.deletedAt,
      author: { id: user.id, name: user.name, username: user.displayUsername, image: user.image },
    })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.authorId))
    .where(and(eq(comments.targetType, targetType), eq(comments.targetId, targetId)))
    .orderBy(asc(comments.createdAt))
    .limit(500);
  // Silinmiş yorumun metni gösterilmez; yanıtları varsa yer tutucu olarak kalır.
  const hasReplies = new Set(rows.map((row) => row.parentId).filter(Boolean));
  return rows
    .filter((row) => !row.deletedAt || hasReplies.has(row.id))
    .map((row) =>
      row.deletedAt ? { ...row, body: "", author: { ...row.author, name: "" } } : row,
    );
}

export async function editComment(authorId: string, commentId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > MAX_COMMENT_LENGTH)
    throw new AppError("invalid", "Geçersiz yorum", "comment_empty");
  const [row] = await db
    .update(comments)
    .set({ body: text, editedAt: new Date() })
    .where(
      and(eq(comments.id, commentId), eq(comments.authorId, authorId), isNull(comments.deletedAt)),
    )
    .returning();
  if (!row) notFound("Yorum bulunamadı", "comment_not_found");
  return row;
}

export async function deleteComment(userId: string, commentId: string, asAdmin = false) {
  const [row] = await db.select().from(comments).where(eq(comments.id, commentId));
  if (!row || row.deletedAt) notFound("Yorum bulunamadı", "comment_not_found");
  if (row.authorId !== userId && !asAdmin) forbidden();
  await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId));
}

// --- Olay tüketicileri (worker) ---

export async function onReactionCreated(payload: EventPayload<"reaction.created">, tx: Tx) {
  const target = await resolveTarget(tx, payload.targetType, payload.targetId);
  if (!target) return;
  await notify(tx, {
    recipientId: target.ownerId,
    type: "reaction",
    groupKey: `reaction:${payload.targetType}:${payload.targetId}`,
    actorId: payload.userId,
    targetType: payload.targetType,
    targetId: payload.targetId,
    data: { gameName: await gameName(tx, target.gameId), entryId: target.entryId },
  });
}

export async function onCommentCreated(payload: EventPayload<"comment.created">, tx: Tx) {
  const target = await resolveTarget(tx, payload.targetType, payload.targetId);
  if (!target) return;
  const data = {
    gameName: await gameName(tx, target.gameId),
    entryId: target.entryId,
    commentId: payload.commentId,
  };
  const notified = new Set<string>([payload.authorId]);
  const common = {
    actorId: payload.authorId,
    targetType: payload.targetType,
    targetId: payload.targetId,
    data,
  };

  if (!notified.has(target.ownerId)) {
    await notify(tx, {
      ...common,
      recipientId: target.ownerId,
      type: "comment",
      groupKey: `comment:${payload.targetType}:${payload.targetId}`,
    });
    notified.add(target.ownerId);
  }
  const replyTo = payload.replyToId ?? payload.parentId;
  if (replyTo) {
    const [parent] = await tx
      .select({ authorId: comments.authorId })
      .from(comments)
      .where(eq(comments.id, replyTo));
    if (parent && !notified.has(parent.authorId)) {
      await notify(tx, {
        ...common,
        recipientId: parent.authorId,
        type: "reply",
        groupKey: `reply:${replyTo}`,
      });
      notified.add(parent.authorId);
    }
  }
  for (const mentionedId of payload.mentions) {
    if (notified.has(mentionedId)) continue;
    await notify(tx, {
      ...common,
      recipientId: mentionedId,
      type: "mention",
      groupKey: `mention:${payload.commentId}`,
    });
    notified.add(mentionedId);
  }
}

export async function onProposalsCreated(payload: EventPayload<"proposals.created">, tx: Tx) {
  await notify(tx, {
    recipientId: payload.userId,
    type: "proposals",
    groupKey: "proposals",
    increment: payload.count,
    data: {},
  });
}
