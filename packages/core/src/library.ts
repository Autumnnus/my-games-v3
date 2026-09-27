import { schema } from "@my-games/db";
import { type EntryStatus, gameCoverUrl, type Platform, type Store } from "@my-games/shared";
import { and, asc, desc, eq, ilike, type SQL, sql } from "drizzle-orm";
import { localToday } from "./config";
import { type DbOrTx, db, type Tx } from "./db";
import { AppError, forbidden, notFound } from "./errors";
import { emit } from "./events";
import { entryPlaytime } from "./playtime";

const { libraryEntries, games, entryHistory, user, screenshots } = schema;

export type Entry = typeof libraryEntries.$inferSelect;

/** Değişiklik geçmişinde izlenen, kullanıcının düzenleyebildiği alanlar. */
export const ENTRY_FIELDS = [
  "status",
  "rating",
  "review",
  "platform",
  "store",
  "playtimeManualMin",
  "playtimeSteamMin",
  "playtimePsnMin",
  "playtimeXboxMin",
  "startedAt",
  "finishedAt",
  "lastPlayedAt",
  "isFavorite",
  "achievementsUnlocked",
  "achievementsTotal",
] as const;
export type EntryField = (typeof ENTRY_FIELDS)[number];

export type EntryFields = {
  status: EntryStatus;
  rating?: number | null;
  review?: string | null;
  platform?: Platform | null;
  store?: Store | null;
  playtimeManualMin?: number;
  playtimeSteamMin?: number | null;
  playtimePsnMin?: number | null;
  playtimeXboxMin?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastPlayedAt?: Date | null;
  isFavorite?: boolean;
  achievementsUnlocked?: number | null;
  achievementsTotal?: number | null;
};

export type ChangeOptions = {
  /** `manual` ya da öneri kaynağı (`steam`, `migration`, `ai`…). */
  source?: string;
  proposalId?: string | null;
  tx?: Tx;
};

type FieldChange = { field: string; from: unknown; to: unknown };

function today() {
  return localToday();
}

function normalize(fields: Partial<EntryFields>): Partial<EntryFields> {
  const next = { ...fields };
  if (next.review !== undefined) next.review = next.review?.trim() ? next.review.trim() : null;
  if (next.rating !== undefined && next.rating !== null) {
    next.rating = Math.round(Math.min(100, Math.max(0, next.rating)));
  }
  if (next.playtimeManualMin !== undefined) {
    next.playtimeManualMin = Math.max(0, Math.round(next.playtimeManualMin));
  }
  return next;
}

function comparable(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

function diff(before: Partial<Entry>, after: Partial<EntryFields>): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of ENTRY_FIELDS) {
    if (!(field in after)) continue;
    const from = comparable(before[field]);
    const to = comparable(after[field as keyof EntryFields]);
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

async function inTx<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>) {
  return tx ? fn(tx) : db.transaction(fn);
}

async function record(
  tx: DbOrTx,
  entry: Pick<Entry, "id" | "userId" | "gameId">,
  action: "create" | "update" | "delete",
  changes: FieldChange[],
  options: ChangeOptions,
  snapshot?: Record<string, unknown>,
) {
  await tx.insert(entryHistory).values({
    userId: entry.userId,
    entryId: action === "delete" ? null : entry.id,
    gameId: entry.gameId,
    action,
    source: options.source ?? "manual",
    changes,
    snapshot: snapshot ?? null,
    proposalId: options.proposalId ?? null,
  });
}

/** Durum geçişlerinde tarihleri kendiliğinden doldurur (kullanıcı ayrıca bir tarih vermediyse). */
function withStatusDefaults(current: Partial<Entry>, patch: Partial<EntryFields>) {
  const next = { ...patch };
  const status = next.status ?? current.status;
  if (next.status && next.status !== current.status) {
    // Form boş tarihleri `null` gönderir; kullanıcı bir tarih vermediyse bugünün tarihi yazılır.
    if (status === "completed" && !current.finishedAt && !next.finishedAt) {
      next.finishedAt = today();
    }
    if (status === "playing" && !current.startedAt && !next.startedAt) {
      next.startedAt = today();
    }
  }
  return next;
}

export async function addEntry(
  userId: string,
  input: EntryFields & { gameId: string; legacyRef?: string | null },
  options: ChangeOptions = {},
) {
  const { gameId, legacyRef, ...raw } = input;
  const fields = withStatusDefaults({}, normalize(raw));

  return inTx(options.tx, async (tx) => {
    const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.id, gameId));
    if (!game) notFound("Oyun bulunamadı");

    const [entry] = await tx
      .insert(libraryEntries)
      .values({ ...fields, status: fields.status ?? input.status, userId, gameId, legacyRef })
      .onConflictDoNothing({ target: [libraryEntries.userId, libraryEntries.gameId] })
      .returning();
    if (!entry) throw new AppError("conflict", "Bu oyun zaten kütüphanende");

    const changes = diff({}, fields).filter((change) => change.to !== null);
    await record(tx, entry, "create", changes, options);
    await emit(tx, "entry.created", {
      entryId: entry.id,
      userId,
      gameId,
      status: entry.status,
      source: options.source ?? "manual",
    });
    return entry;
  });
}

export async function updateEntry(
  userId: string,
  entryId: string,
  patch: Partial<EntryFields>,
  options: ChangeOptions = {},
) {
  return inTx(options.tx, async (tx) => {
    const [current] = await tx
      .select()
      .from(libraryEntries)
      .where(eq(libraryEntries.id, entryId))
      .for("update");
    if (!current) notFound("Kayıt bulunamadı");
    if (current.userId !== userId) forbidden();

    const next = withStatusDefaults(current, normalize(patch));
    const changes = diff(current, next);
    if (changes.length === 0) return current;

    const values = Object.fromEntries(
      changes.map((change) => [change.field, next[change.field as EntryField]]),
    );
    const [entry] = await tx
      .update(libraryEntries)
      .set(values)
      .where(eq(libraryEntries.id, entryId))
      .returning();
    if (!entry) notFound();

    await record(tx, entry, "update", changes, options);
    await emit(tx, "entry.updated", {
      entryId,
      userId,
      gameId: entry.gameId,
      source: options.source ?? "manual",
      changes,
    });
    return entry;
  });
}

export async function deleteEntry(userId: string, entryId: string, options: ChangeOptions = {}) {
  return inTx(options.tx, async (tx) => {
    const [current] = await tx.select().from(libraryEntries).where(eq(libraryEntries.id, entryId));
    if (!current) notFound("Kayıt bulunamadı");
    if (current.userId !== userId) forbidden();

    const snapshot = Object.fromEntries(
      ENTRY_FIELDS.map((field) => [field, comparable(current[field])]),
    );
    const uploads = await tx
      .select({ key: screenshots.storageKey, thumbKey: screenshots.thumbKey })
      .from(screenshots)
      .where(and(eq(screenshots.entryId, entryId), eq(screenshots.kind, "upload")));
    await tx.delete(libraryEntries).where(eq(libraryEntries.id, entryId));
    const keys = uploads.flatMap((row) => [row.key, row.thumbKey]).filter((key) => key !== null);
    if (keys.length > 0) await emit(tx, "storage.objects_orphaned", { keys });
    await record(tx, current, "delete", [], options, { ...snapshot, gameId: current.gameId });
    await emit(tx, "entry.deleted", { entryId, userId, gameId: current.gameId });
  });
}

/** Geçmişteki bir değişikliği geri alır. Geri alma da geçmişe `revert` kaynağıyla yazılır. */
export async function revertHistory(userId: string, historyId: string) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(entryHistory)
      .where(eq(entryHistory.id, historyId))
      .for("update");
    if (!item || item.userId !== userId) notFound("Geçmiş kaydı bulunamadı");
    if (item.revertedAt) throw new AppError("conflict", "Bu değişiklik zaten geri alındı");
    // Moderasyon (ör. kaldırılan inceleme) kullanıcı tarafından geri alınamaz.
    if (item.source === "system") forbidden();

    const options = { source: "revert", tx };
    if (item.action === "update") {
      if (!item.entryId) throw new AppError("conflict", "Kayıt artık yok");
      const [current] = await tx
        .select()
        .from(libraryEntries)
        .where(eq(libraryEntries.id, item.entryId));
      if (!current) throw new AppError("conflict", "Kayıt artık yok");
      // Yalnızca o günden beri başka bir değişiklik görmemiş alanlar geri alınır.
      const patch: Record<string, unknown> = {};
      for (const change of item.changes) {
        if (comparable(current[change.field as EntryField]) === comparable(change.to)) {
          patch[change.field] = revive(change.field, change.from);
        }
      }
      if (Object.keys(patch).length === 0) {
        throw new AppError("conflict", "Alanlar o günden beri değişmiş, geri alınacak bir şey yok");
      }
      await updateEntry(userId, item.entryId, patch as Partial<EntryFields>, options);
    } else if (item.action === "create") {
      if (item.entryId) await deleteEntry(userId, item.entryId, options);
    } else if (item.action === "delete") {
      const snapshot = item.snapshot as Record<string, unknown> | null;
      if (!snapshot?.gameId) throw new AppError("conflict", "Silinen kaydın içeriği yok");
      const fields = Object.fromEntries(
        ENTRY_FIELDS.map((field) => [field, revive(field, snapshot[field])]),
      ) as unknown as EntryFields;
      await addEntry(userId, { ...fields, gameId: String(snapshot.gameId) }, options);
    }

    await tx
      .update(entryHistory)
      .set({ revertedAt: new Date() })
      .where(eq(entryHistory.id, historyId));
  });
}

function revive(field: string, value: unknown) {
  if (field === "lastPlayedAt" && typeof value === "string") return new Date(value);
  return value ?? null;
}

export async function listHistory(
  userId: string,
  options: { entryId?: string; limit?: number } = {},
) {
  const conditions = [eq(entryHistory.userId, userId)];
  if (options.entryId) conditions.push(eq(entryHistory.entryId, options.entryId));
  return db
    .select({
      id: entryHistory.id,
      entryId: entryHistory.entryId,
      action: entryHistory.action,
      source: entryHistory.source,
      changes: entryHistory.changes,
      revertedAt: entryHistory.revertedAt,
      createdAt: entryHistory.createdAt,
      game: { id: games.id, name: games.name, slug: games.slug },
    })
    .from(entryHistory)
    .leftJoin(games, eq(games.id, entryHistory.gameId))
    .where(and(...conditions))
    .orderBy(desc(entryHistory.createdAt))
    .limit(Math.min(options.limit ?? 50, 200));
}

// --- Okuma ---

export const librarySorts = [
  "updated",
  "name",
  "rating",
  "playtime",
  "last_played",
  "finished",
] as const;
export type LibrarySort = (typeof librarySorts)[number];

const playtimeSql = entryPlaytime;

const entryColumns = {
  id: libraryEntries.id,
  userId: libraryEntries.userId,
  status: libraryEntries.status,
  rating: libraryEntries.rating,
  review: libraryEntries.review,
  platform: libraryEntries.platform,
  store: libraryEntries.store,
  playtimeManualMin: libraryEntries.playtimeManualMin,
  playtimeSteamMin: libraryEntries.playtimeSteamMin,
  playtimePsnMin: libraryEntries.playtimePsnMin,
  playtimeXboxMin: libraryEntries.playtimeXboxMin,
  playtimeMin: sql<number>`${playtimeSql}::int`,
  startedAt: libraryEntries.startedAt,
  finishedAt: libraryEntries.finishedAt,
  lastPlayedAt: libraryEntries.lastPlayedAt,
  isFavorite: libraryEntries.isFavorite,
  achievementsUnlocked: libraryEntries.achievementsUnlocked,
  achievementsTotal: libraryEntries.achievementsTotal,
  createdAt: libraryEntries.createdAt,
  updatedAt: libraryEntries.updatedAt,
  game: {
    id: games.id,
    name: games.name,
    slug: games.slug,
    coverImageId: games.coverImageId,
    coverUrl: games.coverUrl,
    releaseDate: games.releaseDate,
    steamAppId: games.steamAppId,
    igdbId: games.igdbId,
    source: games.source,
  },
};

type EntryRow = {
  game: { coverImageId: string | null; coverUrl: string | null } & Record<string, unknown>;
} & Record<string, unknown>;

function present<T extends EntryRow>(row: T) {
  return { ...row, game: { ...row.game, coverUrl: gameCoverUrl(row.game) } };
}

export async function listLibrary(
  ownerId: string,
  filters: {
    status?: EntryStatus;
    q?: string;
    sort?: LibrarySort;
    order?: "asc" | "desc";
    favorites?: boolean;
    limit?: number;
    offset?: number;
  } = {},
) {
  const conditions: SQL[] = [eq(libraryEntries.userId, ownerId)];
  if (filters.status) conditions.push(eq(libraryEntries.status, filters.status));
  if (filters.favorites) conditions.push(eq(libraryEntries.isFavorite, true));
  if (filters.q?.trim()) conditions.push(ilike(games.name, `%${filters.q.trim()}%`));

  const direction = filters.order === "asc" ? asc : desc;
  const orderBy = {
    updated: [direction(libraryEntries.updatedAt)],
    name: [filters.order === "desc" ? desc(games.name) : asc(games.name)],
    rating: [
      sql`${libraryEntries.rating} ${sql.raw(filters.order === "asc" ? "asc" : "desc")} nulls last`,
    ],
    playtime: [direction(playtimeSql)],
    last_played: [
      sql`${libraryEntries.lastPlayedAt} ${sql.raw(filters.order === "asc" ? "asc" : "desc")} nulls last`,
    ],
    finished: [
      sql`${libraryEntries.finishedAt} ${sql.raw(filters.order === "asc" ? "asc" : "desc")} nulls last`,
    ],
  }[filters.sort ?? "updated"];

  const limit = Math.min(Math.max(filters.limit ?? 60, 1), 500);
  const where = and(...conditions);
  const [items, [{ total } = { total: 0 }], statusCounts] = await Promise.all([
    db
      .select(entryColumns)
      .from(libraryEntries)
      .innerJoin(games, eq(games.id, libraryEntries.gameId))
      .where(where)
      .orderBy(...orderBy, asc(libraryEntries.id))
      .limit(limit)
      .offset(filters.offset ?? 0),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(libraryEntries)
      .innerJoin(games, eq(games.id, libraryEntries.gameId))
      .where(where),
    db
      .select({ status: libraryEntries.status, count: sql<number>`count(*)::int` })
      .from(libraryEntries)
      .where(eq(libraryEntries.userId, ownerId))
      .groupBy(libraryEntries.status),
  ]);

  return {
    items: items.map(present),
    total,
    statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row.count])) as Partial<
      Record<EntryStatus, number>
    >,
  };
}

export async function getEntry(entryId: string) {
  const [row] = await db
    .select({
      ...entryColumns,
      user: { id: user.id, name: user.name, username: user.displayUsername, image: user.image },
    })
    .from(libraryEntries)
    .innerJoin(games, eq(games.id, libraryEntries.gameId))
    .innerJoin(user, eq(user.id, libraryEntries.userId))
    .where(eq(libraryEntries.id, entryId));
  if (!row) notFound("Kayıt bulunamadı");
  return present(row);
}

export async function findEntryByGame(userId: string, gameId: string, tx: DbOrTx = db) {
  const [row] = await tx
    .select()
    .from(libraryEntries)
    .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.gameId, gameId)));
  return row ?? null;
}
