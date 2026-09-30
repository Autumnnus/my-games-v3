import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, tstz, updatedAt } from "./_helpers";
import { user } from "./auth";
import { games } from "./catalog";
import { entryStatusEnum, platformEnum, screenshotKindEnum, storeEnum } from "./enums";
import { mediaAssets } from "./media";

/** Kullanıcı × oyun. Görünen toplam süre = manuel + Steam + PSN + Xbox. */
export const libraryEntries = pgTable(
  "library_entries",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: uuid()
      .notNull()
      .references(() => games.id, { onDelete: "restrict" }),
    status: entryStatusEnum().notNull(),
    /** 0–100 (UI'da 0–10, tek ondalık). */
    rating: smallint(),
    review: text(),
    platform: platformEnum(),
    store: storeEnum(),
    playtimeManualMin: integer().notNull().default(0),
    /** Platformların bildirdiği toplam süreler; o platformdan gelmiyorsa null. */
    playtimeSteamMin: integer(),
    playtimePsnMin: integer(),
    playtimeXboxMin: integer(),
    startedAt: date({ mode: "string" }),
    finishedAt: date({ mode: "string" }),
    lastPlayedAt: tstz(),
    isFavorite: boolean().notNull().default(false),
    achievementsUnlocked: integer(),
    achievementsTotal: integer(),
    /** Eski sistemdeki kayıt kimliği; migration'ı tekrar çalıştırılabilir yapar. */
    legacyRef: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex().on(t.userId, t.gameId),
    uniqueIndex().on(t.legacyRef).where(sql`${t.legacyRef} is not null`),
    index().on(t.userId, t.status),
    index().on(t.gameId),
  ],
);

export const screenshots = pgTable(
  "screenshots",
  {
    id: id(),
    entryId: uuid()
      .notNull()
      .references(() => libraryEntries.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: uuid()
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    kind: screenshotKindEnum().notNull(),
    /** `external`/`steam` için tam URL. */
    url: text(),
    /** Platformun verdiği küçük önizleme (Steam). */
    thumbUrl: text(),
    /** Platformdaki kimlik (Steam published file id); tekrar içe aktarmayı önler. */
    externalId: text(),
    /** Görüntünün çekildiği/yüklendiği an (platformdan gelenler için). */
    takenAt: tstz(),
    /** `upload` için dosyalar (varyantlar, boyut, depo). Görsel silinince screenshot da gider. */
    assetId: uuid().references(() => mediaAssets.id, { onDelete: "cascade" }),
    width: integer(),
    height: integer(),
    caption: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.entryId, t.createdAt),
    index().on(t.gameId),
    index().on(t.userId),
    uniqueIndex().on(t.assetId).where(sql`${t.assetId} is not null`),
    uniqueIndex().on(t.userId, t.externalId).where(sql`${t.externalId} is not null`),
  ],
);

/**
 * Akıllı liste: kaydedilmiş bir kütüphane sorgusu (filtre + sıralama). İçerik saklanmaz; liste her açılışta
 * sorgudan üretilir, bu yüzden yeni oyunlar kendiliğinden girer. Filtrenin biçimi core/library-filter.
 */
export const smartLists = pgTable(
  "smart_lists",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    filter: jsonb().$type<Record<string, unknown>>().notNull(),
    sort: text(),
    /** `ai`: asistanın bir cevabından kaydedildi. */
    source: text().$type<"ai" | "manual">().notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
