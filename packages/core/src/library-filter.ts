import { schema } from "@my-games/db";
import { entryStatuses, slugify } from "@my-games/shared";
import { inArray, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { entryPlaytime } from "./playtime";

const { libraryEntries: e, games: g, gameTerms, terms } = schema;

/**
 * Kütüphane filtresi. Hem asistanın kütüphane sorgusu hem kaydedilen akıllı listeler bu biçimi kullanır;
 * böylece asistanın bir cevabı olduğu gibi listeye dönüşür. Alanların hepsi opsiyoneldir ve VE ile
 * birleşir. Puanlar 0–10, süreler saat.
 */
export const libraryFilterSchema = z
  .object({
    statuses: z.array(z.enum(entryStatuses)).min(1).max(entryStatuses.length).optional(),
    minRating: z.number().min(0).max(10).optional(),
    maxRating: z.number().min(0).max(10).optional(),
    /** Yalnızca puanlanmamışlar. */
    unrated: z.boolean().optional(),
    minHours: z.number().min(0).max(100_000).optional(),
    maxHours: z.number().min(0).max(100_000).optional(),
    favorite: z.boolean().optional(),
    finishedYear: z.number().int().min(1970).max(2100).optional(),
    /** Tür ya da tema adı (ör. "RPG", "Strategy"). */
    genre: z.string().trim().min(1).max(60).optional(),
    /** Oyun adında geçen metin. */
    q: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type LibraryFilter = z.infer<typeof libraryFilterSchema>;

/** Filtreyi SQL koşullarına çevirir (`library_entries` ⨝ `games` sorgularında). */
export function filterConditions(filter: LibraryFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.statuses?.length) conditions.push(inArray(e.status, filter.statuses));
  if (filter.minRating !== undefined) {
    conditions.push(sql`${e.rating} >= ${Math.round(filter.minRating * 10)}`);
  }
  if (filter.maxRating !== undefined) {
    conditions.push(sql`${e.rating} <= ${Math.round(filter.maxRating * 10)}`);
  }
  if (filter.unrated) conditions.push(sql`${e.rating} is null`);
  if (filter.minHours !== undefined) {
    conditions.push(sql`${entryPlaytime} >= ${Math.round(filter.minHours * 60)}`);
  }
  if (filter.maxHours !== undefined) {
    conditions.push(sql`${entryPlaytime} <= ${Math.round(filter.maxHours * 60)}`);
  }
  if (filter.favorite) conditions.push(sql`${e.isFavorite} = true`);
  if (filter.finishedYear) {
    conditions.push(
      sql`${e.finishedAt} >= ${`${filter.finishedYear}-01-01`} and ${e.finishedAt} < ${`${filter.finishedYear + 1}-01-01`}`,
    );
  }
  if (filter.genre) {
    const genre = filter.genre;
    conditions.push(sql`exists (
      select 1 from ${gameTerms} gt join ${terms} t on t.id = gt.term_id
      where gt.game_id = ${g.id} and t.kind in ('genre', 'theme')
        and (t.slug = ${slugify(genre)} or lower(t.name) = lower(${genre}))
    )`);
  }
  if (filter.q) conditions.push(sql`${g.name} ilike ${`%${filter.q}%`}`);
  return conditions;
}

/** Boş alanları atar; iki filtre aynı mı diye karşılaştırmak ve kaydetmek için. */
export function normalizeFilter(filter: LibraryFilter): LibraryFilter {
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined && value !== null),
  ) as LibraryFilter;
}
