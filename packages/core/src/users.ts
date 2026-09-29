import { schema } from "@my-games/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, type Tx } from "./db";
import { notFound } from "./errors";
import {
  assetUrls,
  discardAssets,
  markReady,
  reserveUploads,
  type VariantInput,
  verifyPendingAssets,
} from "./media";
import { entryPlaytime } from "./playtime";

const { user, libraryEntries, steamAccounts, mediaAssets } = schema;

export async function findUserByUsername(username: string) {
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.username, username.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/** Profil sayfası başlığı: kişi, özet sayılar ve Steam durumu. */
export async function getProfile(username: string) {
  const found = await findUserByUsername(username);
  if (!found) notFound("Kullanıcı bulunamadı");

  const [[summary], [steam]] = await Promise.all([
    db
      .select({
        games: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${libraryEntries.status} = 'completed')::int`,
        playing: sql<number>`count(*) filter (where ${libraryEntries.status} = 'playing')::int`,
        backlog: sql<number>`count(*) filter (where ${libraryEntries.status} = 'backlog')::int`,
        playtimeMin: sql<number>`coalesce(sum(${entryPlaytime}), 0)::int`,
        averageRating: sql<number | null>`round(avg(${libraryEntries.rating}))::int`,
      })
      .from(libraryEntries)
      .where(eq(libraryEntries.userId, found.id)),
    db
      .select({
        personaName: steamAccounts.personaName,
        profileUrl: steamAccounts.profileUrl,
        currentAppId: steamAccounts.currentAppId,
        currentGameName: steamAccounts.currentGameName,
        currentSince: steamAccounts.currentSince,
      })
      .from(steamAccounts)
      .where(eq(steamAccounts.userId, found.id)),
  ]);

  return {
    user: {
      id: found.id,
      name: found.name,
      username: found.displayUsername ?? found.username,
      image: found.image,
      bio: found.bio ?? null,
      role: found.role,
      createdAt: found.createdAt,
    },
    summary: summary ?? null,
    steam: steam ?? null,
  };
}

/** Avatar yüklemesinin ilk adımı (512 px + 128 px küçük görsel, tarayıcıda AVIF'e çevrilir). */
export async function createAvatarUpload(userId: string, variants: VariantInput[]) {
  const [asset] = await reserveUploads(userId, {
    purpose: "avatar",
    quality: "optimized",
    files: [{ variants }],
  });
  if (!asset) throw new Error("avatar ayrılamadı");
  return asset;
}

async function discardAvatars(tx: Tx, userId: string, keepId?: string) {
  const previous = await tx
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.userId, userId),
        eq(mediaAssets.purpose, "avatar"),
        eq(mediaAssets.status, "ready"),
        keepId ? ne(mediaAssets.id, keepId) : undefined,
      ),
    );
  await discardAssets(tx, previous);
}

/**
 * Yüklenen avatarı doğrular ve profile yazar; önceki avatarın dosyaları silinir. Avatar adresini yalnızca bu
 * akış yazar (istemcinin `updateUser({ image })` ile keyfi adres koyması auth tarafında engellenir).
 */
export async function confirmAvatar(userId: string, assetId: string) {
  const [asset] = await verifyPendingAssets(userId, "avatar", [assetId]);
  if (!asset) notFound();
  const { url } = assetUrls(asset);
  await db.transaction(async (tx) => {
    await markReady(tx, [asset.id]);
    await discardAvatars(tx, userId, asset.id);
    await tx.update(user).set({ image: url }).where(eq(user.id, userId));
  });
  return { image: url };
}

export async function removeAvatar(userId: string) {
  await db.transaction(async (tx) => {
    await discardAvatars(tx, userId);
    await tx.update(user).set({ image: null }).where(eq(user.id, userId));
  });
}
