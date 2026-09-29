import type { MediaPurpose, MediaVariantName, UploadQuality } from "@my-games/shared";
import { bigint, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, tstz } from "./_helpers";
import { user } from "./auth";

export type MediaVariant = {
  name: MediaVariantName;
  /** Depodaki nesne anahtarı (`users/{userId}/{purpose}/{assetId}/{name}.{ext}`). */
  key: string;
  bytes: number;
  contentType: string;
  width: number | null;
  height: number | null;
};

/**
 * Kullanıcının yüklediği her görsel (screenshot, avatar) ve varyantları. Kota bu tablodan hesaplanır:
 * `pending` satırlar da sayılır ki yükleme sürerken kota iki kez harcanamasın.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Dosyaların durduğu depo. `null` = sistemin R2'si (kotaya sayılan tek hedef). */
    targetId: uuid(),
    purpose: text().$type<MediaPurpose>().notNull(),
    quality: text().$type<UploadQuality>().notNull(),
    status: text().$type<"pending" | "ready">().notNull().default("pending"),
    variants: jsonb().$type<MediaVariant[]>().notNull(),
    /** Tüm varyantların toplamı. */
    totalBytes: bigint({ mode: "number" }).notNull(),
    createdAt: createdAt(),
    confirmedAt: tstz(),
  },
  (t) => [index().on(t.userId, t.purpose), index().on(t.status, t.createdAt)],
);

/** Kullanıcının depolama ayarları: admin'in verdiği kota ve yükleme kalitesi tercihi. */
export const userStorage = pgTable("user_storage", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** `null` = varsayılan kota. */
  quotaBytes: bigint({ mode: "number" }),
  quotaNote: text(),
  quotaSetBy: text(),
  quotaUpdatedAt: tstz(),
  uploadQuality: text().$type<UploadQuality>().notNull().default("optimized"),
});
