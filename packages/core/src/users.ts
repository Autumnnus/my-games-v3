import { schema } from "@my-games/db";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { AppError, notFound } from "./errors";
import { entryPlaytime } from "./playtime";
import {
  type AllowedImageType,
  isAllowedImageType,
  newObjectKey,
  presignPut,
  publicUrl,
} from "./storage";

const { user, libraryEntries, steamAccounts } = schema;

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

/** İstemci avatarı 512 px'e küçültür; bu sınır bol bol yeter. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Avatar için tek imzalı URL. Yükleme bitince istemci Better Auth `updateUser({ image })` çağırır. */
export async function createAvatarUploadTarget(userId: string, contentType: string, size: number) {
  if (!isAllowedImageType(contentType)) throw new AppError("invalid", "Desteklenmeyen dosya türü");
  if (size > AVATAR_MAX_BYTES) throw new AppError("invalid", "Dosya çok büyük");
  const key = newObjectKey("avatars", userId, contentType as AllowedImageType);
  const upload = await presignPut(key, contentType as AllowedImageType, size);
  return { key, upload, url: publicUrl(key) };
}
