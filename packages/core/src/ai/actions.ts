import { schema } from "@my-games/db";
import { type EntryStatus, gameCoverUrl, ratingFromStored, ratingToStored } from "@my-games/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { importIgdbGame } from "../catalog";
import { db } from "../db";
import { AppError } from "../errors";
import { addEntry, type EntryFields, findEntryByGame, updateEntry } from "../library";
import { listProposals, resolveMany } from "../proposals";

const { libraryEntries, games, changeProposals, entryHistory } = schema;

/**
 * Asistanın yaptığı değişiklikler. Her biri kullanıcı onayladıktan sonra çalışır (agent'ın tool onayı) ve
 * uygulamanın geri kalanıyla aynı yoldan geçer: `change_proposals`'a onaylanmış öneri (`source: ai`) olarak
 * yazılır, kütüphane değişikliği geçmişe o öneriyle bağlanır; böylece akış, bildirimler ve "geri al"
 * elle yapılan değişikliklerle aynı çalışır.
 */

export type GameBrief = {
  gameId: string;
  slug: string;
  name: string;
  coverUrl: string | null;
  accentColor: string | null;
};

export type ChangeView = { field: string; from: unknown; to: unknown };

export type EntryPatch = {
  status?: EntryStatus;
  /** 0–10; `null` puanı kaldırır. */
  rating?: number | null;
  review?: string | null;
  favorite?: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
  /** Elle girilen süre (saat); platform süreleri ayrıdır ve değişmez. */
  playtimeHours?: number;
};

type GameRow = typeof games.$inferSelect;

export function briefOf(
  game: Pick<GameRow, "id" | "slug" | "name" | "coverImageId" | "coverUrl" | "accentColor">,
): GameBrief {
  return {
    gameId: game.id,
    slug: game.slug,
    name: game.name,
    coverUrl: gameCoverUrl(game),
    accentColor: game.accentColor,
  };
}

/** Kullanıcıya gösterilen değerler: puan 0–10, elle girilen süre saat. */
function displayValue(field: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (field === "rating" && typeof value === "number") return ratingFromStored(value);
  if (field === "playtimeManualMin" && typeof value === "number")
    return Math.round((value / 60) * 10) / 10;
  return value;
}

const DISPLAY_FIELD: Record<string, string> = {
  playtimeManualMin: "playtimeHours",
  isFavorite: "favorite",
};

export function displayChanges(
  changes: Array<{ field: string; from: unknown; to: unknown }>,
): ChangeView[] {
  return changes.map((change) => ({
    field: DISPLAY_FIELD[change.field] ?? change.field,
    from: displayValue(change.field, change.from),
    to: displayValue(change.field, change.to),
  }));
}

function toFields(patch: EntryPatch): Partial<EntryFields> {
  const fields: Partial<EntryFields> = {};
  if (patch.status !== undefined) fields.status = patch.status;
  if (patch.rating !== undefined)
    fields.rating = patch.rating === null ? null : ratingToStored(patch.rating);
  if (patch.review !== undefined) fields.review = patch.review;
  if (patch.favorite !== undefined) fields.isFavorite = patch.favorite;
  if (patch.startedAt !== undefined) fields.startedAt = patch.startedAt;
  if (patch.finishedAt !== undefined) fields.finishedAt = patch.finishedAt;
  if (patch.playtimeHours !== undefined)
    fields.playtimeManualMin = Math.round(patch.playtimeHours * 60);
  return fields;
}

async function ownEntry(userId: string, entryId: string) {
  const [row] = await db
    .select({ entry: libraryEntries, game: games })
    .from(libraryEntries)
    .innerJoin(games, eq(games.id, libraryEntries.gameId))
    .where(eq(libraryEntries.id, entryId));
  return row && row.entry.userId === userId ? row : null;
}

export type Preview<T> = ({ ok: true } & T) | { ok: false; reason: string };

/** Onay kartında gösterilecek fark. Değişiklik yoksa ya da kayıt kullanıcının değilse `ok: false`. */
export async function previewEntryUpdate(
  userId: string,
  entryId: string,
  patch: EntryPatch,
): Promise<Preview<{ entryId: string; game: GameBrief; changes: ChangeView[] }>> {
  const row = await ownEntry(userId, entryId);
  if (!row) return { ok: false, reason: "Bu kayıt kullanıcının kütüphanesinde yok." };
  const fields = toFields(patch);
  const changes = Object.entries(fields)
    .map(([field, to]) => ({
      field,
      from: row.entry[field as keyof typeof row.entry] ?? null,
      to: to ?? null,
    }))
    .filter((change) => JSON.stringify(change.from) !== JSON.stringify(change.to));
  if (changes.length === 0)
    return { ok: false, reason: "Kayıt zaten bu değerlerde; değişecek bir şey yok." };
  return { ok: true, entryId, game: briefOf(row.game), changes: displayChanges(changes) };
}

export async function applyEntryUpdate(userId: string, entryId: string, patch: EntryPatch) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ entry: libraryEntries, game: games })
      .from(libraryEntries)
      .innerJoin(games, eq(games.id, libraryEntries.gameId))
      .where(eq(libraryEntries.id, entryId));
    if (!row || row.entry.userId !== userId) throw new AppError("not_found", "Kayıt bulunamadı");
    const fields = toFields(patch);
    const [proposal] = await tx
      .insert(changeProposals)
      .values({
        userId,
        entryId,
        gameId: row.entry.gameId,
        source: "ai",
        kind: "entry_update",
        payload: {
          op: "update",
          changes: Object.entries(fields).map(([field, to]) => ({
            field,
            from: row.entry[field as keyof typeof row.entry] ?? null,
            to,
          })),
        },
        status: "approved",
        resolvedAt: new Date(),
      })
      .returning({ id: changeProposals.id });
    if (!proposal) throw new AppError("conflict");
    await updateEntry(userId, entryId, fields, { source: "ai", proposalId: proposal.id, tx });
    const [history] = await tx
      .select({ id: entryHistory.id, changes: entryHistory.changes })
      .from(entryHistory)
      .where(eq(entryHistory.proposalId, proposal.id))
      .orderBy(desc(entryHistory.createdAt))
      .limit(1);
    return {
      entryId,
      game: briefOf(row.game),
      // Geçmişteki değişiklikler, durum geçişinin kendiliğinden doldurduğu tarihleri de içerir.
      changes: displayChanges(history?.changes ?? []),
      historyId: history?.id ?? null,
    };
  });
}

export type AddInput = {
  gameId?: string;
  igdbId?: number;
  status: EntryStatus;
  rating?: number | null;
  review?: string | null;
  favorite?: boolean;
  playtimeHours?: number;
};

async function targetGame(input: Pick<AddInput, "gameId" | "igdbId">) {
  if (input.gameId) {
    const [game] = await db.select().from(games).where(eq(games.id, input.gameId));
    return game ?? null;
  }
  if (input.igdbId) {
    const [game] = await db.select().from(games).where(eq(games.igdbId, input.igdbId));
    // Katalogda yoksa IGDB'den alınır (katalog herkesin; kütüphaneye ekleme onaydan sonra).
    return game ?? (await importIgdbGame(input.igdbId).catch(() => null));
  }
  return null;
}

export async function previewAddToLibrary(
  userId: string,
  input: AddInput,
): Promise<Preview<{ game: GameBrief; changes: ChangeView[] }>> {
  const game = await targetGame(input);
  if (!game) return { ok: false, reason: "Oyun katalogda bulunamadı; önce searchCatalog ile ara." };
  const existing = await findEntryByGame(userId, game.id);
  if (existing) {
    return {
      ok: false,
      reason: `Oyun zaten kütüphanede (entryId ${existing.id}); değiştirmek için updateEntry kullan.`,
    };
  }
  const fields = toFields(input);
  return {
    ok: true,
    game: briefOf(game),
    changes: displayChanges(
      Object.entries(fields).map(([field, to]) => ({ field, from: null, to: to ?? null })),
    ),
  };
}

export async function applyAddToLibrary(userId: string, input: AddInput) {
  const game = await targetGame(input);
  if (!game) throw new AppError("not_found", "Oyun bulunamadı");
  const fields = { status: input.status, ...toFields(input) } as EntryFields;
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .insert(changeProposals)
      .values({
        userId,
        gameId: game.id,
        source: "ai",
        kind: "entry_create",
        payload: { op: "create", game: { gameId: game.id, name: game.name }, fields },
        status: "approved",
        resolvedAt: new Date(),
      })
      .returning({ id: changeProposals.id });
    if (!proposal) throw new AppError("conflict");
    const entry = await addEntry(
      userId,
      { ...fields, gameId: game.id },
      {
        source: "ai",
        proposalId: proposal.id,
        tx,
      },
    );
    await tx
      .update(changeProposals)
      .set({ entryId: entry.id })
      .where(eq(changeProposals.id, proposal.id));
    const [history] = await tx
      .select({ id: entryHistory.id })
      .from(entryHistory)
      .where(eq(entryHistory.proposalId, proposal.id))
      .limit(1);
    return {
      entryId: entry.id,
      game: briefOf(game),
      changes: displayChanges(
        Object.entries(fields).map(([field, to]) => ({ field, from: null, to: to ?? null })),
      ),
      historyId: history?.id ?? null,
    };
  });
}

/** Onay kutusundaki bekleyen önerilerin kısa özeti (asistanın okuyup çözebilmesi için). */
export async function inboxSummary(userId: string, limit = 12) {
  const rows = await listProposals(userId, "pending", limit);
  return rows.map((row) => {
    const payload = row.payload as {
      op?: string;
      changes?: Array<{ field: string; from: unknown; to: unknown }>;
      fields?: { status?: string };
      items?: unknown[];
    };
    return {
      id: row.id,
      source: row.source,
      kind: row.kind,
      game: row.game?.id
        ? {
            gameId: row.game.id,
            slug: row.game.slug ?? "",
            name: row.game.name ?? "",
            coverUrl: gameCoverUrl({
              coverImageId: row.game.coverImageId,
              coverUrl: row.game.coverUrl,
            }),
            accentColor: row.game.accentColor,
          }
        : null,
      changes: payload.changes ? displayChanges(payload.changes) : undefined,
      status: payload.fields?.status,
      screenshots: payload.items?.length,
      createdAt: row.createdAt,
    };
  });
}

export async function previewResolveInbox(userId: string, ids: string[]) {
  const pending = await db
    .select({ id: changeProposals.id })
    .from(changeProposals)
    .where(
      and(
        eq(changeProposals.userId, userId),
        eq(changeProposals.status, "pending"),
        inArray(changeProposals.id, ids),
      ),
    );
  const found = new Set(pending.map((row) => row.id));
  const all = await inboxSummary(userId, 200);
  return all.filter((item) => found.has(item.id));
}

export async function applyResolveInbox(
  userId: string,
  ids: string[],
  action: "approve" | "reject",
) {
  return resolveMany(userId, ids, action);
}
