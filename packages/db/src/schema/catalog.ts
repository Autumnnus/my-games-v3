import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, tstz, updatedAt } from "./_helpers";
import { user } from "./auth";
import { gameSourceEnum, termKindEnum } from "./enums";

/** Tüm kullanıcıların paylaştığı oyun kataloğu. Kullanıcıya özel veri `library_entries`'te. */
export const games = pgTable(
  "games",
  {
    id: id(),
    source: gameSourceEnum().notNull(),
    igdbId: integer(),
    steamAppId: integer(),
    name: text().notNull(),
    slug: text().notNull(),
    summary: text(),
    storyline: text(),
    /** IGDB görsel kimliği; URL istemcide boyuta göre üretilir. */
    coverImageId: text(),
    /** IGDB'de olmayan oyunlar için doğrudan kapak URL'i (eski veri, Steam, elle). */
    coverUrl: text(),
    releaseDate: date({ mode: "string" }),
    /** IGDB game type (main_game, dlc, remake…). */
    gameType: text(),
    rating: real(),
    ratingCount: integer(),
    /** IGDB time-to-beat (saniye). */
    timeToBeatHastily: integer(),
    timeToBeatNormally: integer(),
    timeToBeatCompletely: integer(),
    createdById: text().references(() => user.id, { onDelete: "set null" }),
    metadataSyncedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex().on(t.slug),
    uniqueIndex().on(t.igdbId).where(sql`${t.igdbId} is not null`),
    uniqueIndex().on(t.steamAppId).where(sql`${t.steamAppId} is not null`),
    index("games_name_trgm_idx").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
  ],
);

/** Tür, tema, oyun modu, bakış açısı ve şirketler tek tabloda. */
export const terms = pgTable(
  "terms",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    kind: termKindEnum().notNull(),
    igdbId: integer(),
    name: text().notNull(),
    slug: text().notNull(),
  },
  (t) => [uniqueIndex().on(t.kind, t.slug), uniqueIndex().on(t.kind, t.igdbId)],
);

export const gameTerms = pgTable(
  "game_terms",
  {
    gameId: uuid()
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    termId: integer()
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    /** Şirketler için `developer` / `publisher`; diğer türlerde boş. */
    role: text().notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.termId, t.role] }), index().on(t.termId)],
);

/**
 * Oyunun platformlardaki kimlikleri: Steam'in ek app'leri (asıl kimlik `games.steam_app_id`), PSN
 * `concept:<id>` / `np:<npCommunicationId>`, Xbox `titleId`. Sync bir başlığı buradan oyuna bağlar.
 */
export const gameExternalIds = pgTable(
  "game_external_ids",
  {
    provider: text().notNull(),
    externalId: text().notNull(),
    gameId: uuid()
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.externalId] }), index().on(t.gameId)],
);
