import { schema } from "@my-games/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { AppError, notFound } from "./errors";
import { type LibrarySort, librarySorts } from "./library";
import { filterConditions, libraryFilterSchema, normalizeFilter } from "./library-filter";

const { smartLists, libraryEntries, games } = schema;

/** Kullanıcı başına akıllı liste sınırı (kütüphane sayfasında satır hâlinde gösterilir). */
const MAX_LISTS = 30;

export type SmartList = typeof smartLists.$inferSelect;

function sortOf(value: string | null | undefined): LibrarySort | null {
  return value && (librarySorts as readonly string[]).includes(value)
    ? (value as LibrarySort)
    : null;
}

/** Kullanıcının listeleri ve her birinde şu an kaç oyun olduğu (listeler herkese açık). */
export async function listSmartLists(userId: string) {
  const rows = await db
    .select()
    .from(smartLists)
    .where(eq(smartLists.userId, userId))
    .orderBy(asc(smartLists.createdAt));
  return Promise.all(
    rows.map(async (row) => {
      const filter = libraryFilterSchema.safeParse(row.filter);
      const [counted] = filter.success
        ? await db
            .select({ count: sql<number>`count(*)::int` })
            .from(libraryEntries)
            .innerJoin(games, eq(games.id, libraryEntries.gameId))
            .where(and(eq(libraryEntries.userId, userId), ...filterConditions(filter.data)))
        : [{ count: 0 }];
      return {
        id: row.id,
        name: row.name,
        filter: filter.success ? filter.data : {},
        sort: sortOf(row.sort),
        source: row.source,
        count: counted?.count ?? 0,
        createdAt: row.createdAt,
      };
    }),
  );
}

export async function getSmartList(id: string) {
  const [row] = await db.select().from(smartLists).where(eq(smartLists.id, id));
  if (!row) notFound("Liste bulunamadı", "list_not_found");
  const filter = libraryFilterSchema.safeParse(row.filter);
  return { ...row, filter: filter.success ? filter.data : {}, sort: sortOf(row.sort) };
}

export async function createSmartList(
  userId: string,
  input: { name: string; filter: unknown; sort?: string | null; source?: "ai" | "manual" },
) {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new AppError("invalid", "Liste adı boş", "list_name_empty");
  const filter = libraryFilterSchema.safeParse(input.filter);
  if (!filter.success)
    throw new AppError("invalid", "Liste filtresi geçersiz", "list_filter_invalid");
  const normalized = normalizeFilter(filter.data);
  if (Object.keys(normalized).length === 0)
    throw new AppError("invalid", "Liste filtresi boş", "list_filter_empty");

  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(smartLists)
    .where(eq(smartLists.userId, userId));
  if ((counted?.count ?? 0) >= MAX_LISTS) {
    throw new AppError("conflict", `En fazla ${MAX_LISTS} akıllı liste olabilir`, "list_limit");
  }

  const [row] = await db
    .insert(smartLists)
    .values({
      userId,
      name,
      filter: normalized,
      sort: sortOf(input.sort),
      source: input.source ?? "manual",
    })
    .returning();
  if (!row) throw new AppError("conflict");
  return row;
}

export async function renameSmartList(userId: string, id: string, name: string) {
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) throw new AppError("invalid", "Liste adı boş", "list_name_empty");
  const [row] = await db
    .update(smartLists)
    .set({ name: trimmed })
    .where(and(eq(smartLists.id, id), eq(smartLists.userId, userId)))
    .returning();
  if (!row) notFound("Liste bulunamadı", "list_not_found");
  return row;
}

export async function deleteSmartList(userId: string, id: string) {
  const deleted = await db
    .delete(smartLists)
    .where(and(eq(smartLists.id, id), eq(smartLists.userId, userId)))
    .returning({ id: smartLists.id });
  if (deleted.length === 0) notFound("Liste bulunamadı", "list_not_found");
}
