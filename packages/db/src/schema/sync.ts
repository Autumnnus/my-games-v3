import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, tstz, updatedAt } from "./_helpers";
import { user } from "./auth";
import { games } from "./catalog";
import {
  playSessionSourceEnum,
  proposalSourceEnum,
  proposalStatusEnum,
  syncActionEnum,
} from "./enums";
import { libraryEntries } from "./library";

export type FieldChange = { field: string; from: unknown; to: unknown };

/**
 * Onay kutusu. Elle yapılmayan her değişiklik önce burada öneri olarak doğar.
 * `payload` türe göre değişir (bkz. core/proposals).
 */
export const changeProposals = pgTable(
  "change_proposals",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entryId: uuid().references(() => libraryEntries.id, { onDelete: "cascade" }),
    gameId: uuid().references(() => games.id, { onDelete: "cascade" }),
    source: proposalSourceEnum().notNull(),
    kind: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    /** Aynı şeyi iki kez önermemek için (ör. `steam:new_game:1245620`). */
    dedupeKey: text(),
    confidence: real(),
    status: proposalStatusEnum().notNull().default("pending"),
    createdAt: createdAt(),
    resolvedAt: tstz(),
  },
  (t) => [
    index().on(t.userId, t.status, t.createdAt),
    uniqueIndex()
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.status} = 'pending' and ${t.dedupeKey} is not null`),
  ],
);

/** Kullanıcının kaynak × öneri türü başına seçtiği davranış. Kayıt yoksa varsayılan geçerli. */
export const syncRules = pgTable(
  "sync_rules",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: proposalSourceEnum().notNull(),
    kind: text().notNull(),
    action: syncActionEnum().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.source, t.kind] })],
);

/** "Bir daha sorma" listesi (ör. Steam'deki bir test uygulaması). */
export const syncIgnores = pgTable(
  "sync_ignores",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: proposalSourceEnum().notNull(),
    /** Öneri türü ve hedefi: `new_game:<steamAppId>`, `status:<entryId>`, `match:<gameId>`… */
    externalId: text().notNull(),
    /** Listede gösterilecek ad (oyun adı). */
    label: text(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.source, t.externalId] })],
);

/** Kütüphane kaydı değişiklik geçmişi; geri alma buradan yapılır. */
export const entryHistory = pgTable(
  "entry_history",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entryId: uuid().references(() => libraryEntries.id, { onDelete: "set null" }),
    gameId: uuid().references(() => games.id, { onDelete: "set null" }),
    action: text().$type<"create" | "update" | "delete">().notNull(),
    /** `manual` ya da öneri kaynağı. */
    source: text().notNull(),
    changes: jsonb().$type<FieldChange[]>().notNull(),
    /** Silinen kaydın tamamı (geri almak için). */
    snapshot: jsonb().$type<Record<string, unknown>>(),
    proposalId: uuid().references(() => changeProposals.id, { onDelete: "set null" }),
    revertedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.entryId, t.createdAt)],
);

export const steamAccounts = pgTable(
  "steam_accounts",
  {
    userId: text()
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    steamId: text().notNull(),
    personaName: text(),
    avatarUrl: text(),
    profileUrl: text(),
    /** 3 = public. Kütüphane okunamıyorsa sync hata verir. */
    visibility: integer(),
    syncEnabled: boolean().notNull().default(true),
    lastSyncedAt: tstz(),
    lastSyncError: text(),
    /** Şu an oynanan oyun (presence). */
    currentAppId: integer(),
    currentGameName: text(),
    currentSince: tstz(),
    /** Steam ekran görüntülerinin son içe aktarılma zamanı (ilk aktarım akışa düşmez). */
    screenshotsSyncedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.steamId)],
);

/** Oyun oturumları. Steam oturum geçmişi vermediği için sync'ler arasındaki süre farkından üretilir. */
export const playSessions = pgTable(
  "play_sessions",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: uuid()
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    entryId: uuid().references(() => libraryEntries.id, { onDelete: "set null" }),
    source: playSessionSourceEnum().notNull(),
    startedAt: tstz().notNull(),
    endedAt: tstz().notNull(),
    durationMin: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.endedAt), index().on(t.gameId)],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: id(),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    source: proposalSourceEnum().notNull(),
    startedAt: tstz().notNull().defaultNow(),
    finishedAt: tstz(),
    ok: boolean(),
    stats: jsonb().$type<Record<string, number>>(),
    error: text(),
  },
  (t) => [index().on(t.userId, t.startedAt)],
);

/**
 * Platformdan en son gözlenen süre ve başarım sayısı (başlık başına). Oturum farkları kütüphane kaydından
 * değil buradan hesaplanır; böylece öneri onay beklerken aynı süre iki kez oturum olarak yazılmaz.
 */
export const platformSnapshots = pgTable(
  "platform_snapshots",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    /** Steam app id, PSN `concept:<id>` / `np:<id>`, Xbox titleId. */
    externalId: text().notNull(),
    playtimeMin: integer(),
    /** Başlık listesinin bildirdiği açılan başarım sayısı; değişince ayrıntı çekilir. */
    achievementsUnlocked: integer(),
    achievementsCheckedAt: tstz(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider, t.externalId] })],
);

/**
 * Steam dışındaki bağlı platform hesapları (PSN, Xbox). Kimlik bilgileri (yenileme token'ı) şifreli
 * saklanır; süresi dolarsa `needsReauth` açılır ve kullanıcıdan yeniden bağlaması istenir.
 */
export const platformAccounts = pgTable(
  "platform_accounts",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    /** PSN accountId, Xbox XUID. */
    externalId: text().notNull(),
    displayName: text(),
    avatarUrl: text(),
    /** AES-256-GCM ile şifrelenmiş JSON (token'lar). */
    credentials: text().notNull(),
    credentialsExpireAt: tstz(),
    needsReauth: boolean().notNull().default(false),
    syncEnabled: boolean().notNull().default(true),
    lastSyncedAt: tstz(),
    lastSyncError: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.provider] }),
    uniqueIndex().on(t.provider, t.externalId),
  ],
);

/** Bir platform oyununun başarım seti (herkes için ortak; kütüphanelerde olan oyunlar için tutulur). */
export const achievementSets = pgTable(
  "achievement_sets",
  {
    provider: text().notNull(),
    /** Steam app id, PSN npCommunicationId, Xbox titleId. */
    gameKey: text().notNull(),
    /** Setin bağlı olduğu katalog oyunu (oyun sayfası başarımları buradan bulur). */
    gameId: uuid().references(() => games.id, { onDelete: "set null" }),
    total: integer().notNull(),
    fetchedAt: tstz().notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.gameKey] }), index().on(t.gameId)],
);

export const achievements = pgTable(
  "achievements",
  {
    provider: text().notNull(),
    gameKey: text().notNull(),
    /** Platformdaki kimlik (Steam apiname, PSN trophyId, Xbox id). */
    apiName: text().notNull(),
    position: integer().notNull().default(0),
    name: text().notNull(),
    description: text(),
    /** Diğer dillerdeki ad/açıklama: `{ tr: { name, description } }`. */
    localized: jsonb().$type<Record<string, { name: string; description: string | null }>>(),
    iconUrl: text(),
    iconLockedUrl: text(),
    hidden: boolean().notNull().default(false),
    /** Oyuncuların yüzde kaçı açtı (0–100). */
    rarity: real(),
    /** PSN: bronze/silver/gold/platinum; Xbox: gamerscore. */
    grade: text(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.gameKey, t.apiName] })],
);

/** Kullanıcının açtığı başarımlar (yalnızca açılanlar saklanır). */
export const userAchievements = pgTable(
  "user_achievements",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    gameKey: text().notNull(),
    apiName: text().notNull(),
    unlockedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.provider, t.gameKey, t.apiName] }),
    index().on(t.userId, t.unlockedAt),
  ],
);
