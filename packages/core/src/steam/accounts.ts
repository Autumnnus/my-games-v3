import { schema } from "@my-games/db";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { AppError } from "../errors";
import { emit } from "../events";
import type { PlayerSummary } from "./api";

const { steamAccounts, steamSnapshots } = schema;

/**
 * Doğrulanmış (OpenID) Steam hesabını kullanıcıya bağlar ve ilk senkronizasyonu tetikler. Aynı Steam
 * hesabı başka bir kullanıcıya bağlıysa reddedilir.
 */
export async function linkSteamAccount(
  userId: string,
  steamId: string,
  profile?: PlayerSummary | null,
) {
  await db.transaction(async (tx) => {
    const [taken] = await tx.select().from(steamAccounts).where(eq(steamAccounts.steamId, steamId));
    if (taken && taken.userId !== userId) {
      throw new AppError("conflict", "Bu Steam hesabı başka bir kullanıcıya bağlı");
    }
    // Farklı bir Steam hesabına geçildiyse eski hesabın süre gözlemleri sahte oturum üretmesin; ilk sync
    // yeni hesabı sıfırdan gözlemler.
    const [previous] = await tx
      .select({ steamId: steamAccounts.steamId })
      .from(steamAccounts)
      .where(eq(steamAccounts.userId, userId));
    if (previous && previous.steamId !== steamId) {
      await tx.delete(steamSnapshots).where(eq(steamSnapshots.userId, userId));
    }
    const values = {
      steamId,
      personaName: profile?.personaname ?? null,
      avatarUrl: profile?.avatarfull ?? null,
      profileUrl: profile?.profileurl ?? null,
      visibility: profile?.communityvisibilitystate ?? null,
      lastSyncError: null,
    };
    await tx
      .insert(steamAccounts)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: steamAccounts.userId, set: values });
    await emit(tx, "steam.sync_requested", { userId });
  });
}

/**
 * Senkronizasyonu durdurur ve Steam bağlantısını kaldırır. Kullanıcının başka giriş yöntemi yoksa (sadece
 * Steam ile kayıt olduysa) giriş bağlantısı korunur; yoksa hesabına bir daha giremez.
 */
export async function unlinkSteamAccount(userId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(steamAccounts).where(eq(steamAccounts.userId, userId));
    await tx.delete(steamSnapshots).where(eq(steamSnapshots.userId, userId));
    const accounts = await tx
      .select({ id: schema.account.id, providerId: schema.account.providerId })
      .from(schema.account)
      .where(eq(schema.account.userId, userId));
    const steam = accounts.filter((account) => account.providerId === "steam");
    if (steam.length > 0 && accounts.length > steam.length) {
      await tx
        .delete(schema.account)
        .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "steam")));
    }
  });
}

export async function getSteamStatus(userId: string) {
  const [row] = await db.select().from(steamAccounts).where(eq(steamAccounts.userId, userId));
  return row ?? null;
}

export async function setSteamSyncEnabled(userId: string, enabled: boolean) {
  await db
    .update(steamAccounts)
    .set({ syncEnabled: enabled })
    .where(eq(steamAccounts.userId, userId));
}

export async function requestSteamSync(userId: string) {
  const account = await getSteamStatus(userId);
  if (!account) throw new AppError("not_found", "Steam hesabı bağlı değil");
  await db.transaction((tx) => emit(tx, "steam.sync_requested", { userId }));
}
