import { schema } from "@my-games/db";
import { and, eq, sql } from "drizzle-orm";
import { decryptCredentials, encryptCredentials } from "../credentials";
import { db } from "../db";
import { AppError } from "../errors";
import { emit } from "../events";

const { platformAccounts, platformSnapshots } = schema;

export type LinkedProvider = "psn" | "xbox";

/** Platform token'ı geçersiz: kullanıcı yeniden bağlamalı. */
export class PlatformReauthError extends AppError {
  constructor(provider: LinkedProvider) {
    super("unavailable", `${provider} bağlantısının süresi doldu, yeniden bağlanmalı`);
  }
}

export type PlatformAccount = typeof platformAccounts.$inferSelect;

export async function getPlatformAccount(userId: string, provider: LinkedProvider) {
  const [row] = await db
    .select()
    .from(platformAccounts)
    .where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.provider, provider)));
  return row ?? null;
}

/**
 * Doğrulanmış platform hesabını kullanıcıya bağlar ve ilk senkronizasyonu tetikler. Aynı platform hesabı
 * başka kullanıcıya bağlıysa reddedilir; farklı bir hesaba geçildiyse eski gözlemler silinir.
 */
export async function savePlatformAccount(input: {
  userId: string;
  provider: LinkedProvider;
  externalId: string;
  displayName: string | null;
  avatarUrl: string | null;
  credentials: unknown;
  credentialsExpireAt: Date | null;
}) {
  await db.transaction(async (tx) => {
    const [taken] = await tx
      .select({ userId: platformAccounts.userId })
      .from(platformAccounts)
      .where(
        and(
          eq(platformAccounts.provider, input.provider),
          eq(platformAccounts.externalId, input.externalId),
        ),
      );
    if (taken && taken.userId !== input.userId) {
      throw new AppError("conflict", "Bu hesap başka bir kullanıcıya bağlı");
    }
    const [previous] = await tx
      .select({ externalId: platformAccounts.externalId })
      .from(platformAccounts)
      .where(
        and(
          eq(platformAccounts.userId, input.userId),
          eq(platformAccounts.provider, input.provider),
        ),
      );
    if (previous && previous.externalId !== input.externalId) {
      await tx
        .delete(platformSnapshots)
        .where(
          and(
            eq(platformSnapshots.userId, input.userId),
            eq(platformSnapshots.provider, input.provider),
          ),
        );
    }
    const values = {
      externalId: input.externalId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      credentials: encryptCredentials(input.credentials),
      credentialsExpireAt: input.credentialsExpireAt,
      needsReauth: false,
      lastSyncError: null,
    };
    await tx
      .insert(platformAccounts)
      .values({ userId: input.userId, provider: input.provider, ...values })
      .onConflictDoUpdate({
        target: [platformAccounts.userId, platformAccounts.provider],
        set: { ...values, updatedAt: new Date() },
      });
    await emit(tx, "platform.sync_requested", { userId: input.userId, provider: input.provider });
  });
}

export function readCredentials<T>(account: PlatformAccount) {
  return decryptCredentials<T>(account.credentials);
}

export async function updateCredentials(
  account: PlatformAccount,
  credentials: unknown,
  credentialsExpireAt?: Date | null,
) {
  await db
    .update(platformAccounts)
    .set({
      credentials: encryptCredentials(credentials),
      ...(credentialsExpireAt !== undefined ? { credentialsExpireAt } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(platformAccounts.userId, account.userId),
        eq(platformAccounts.provider, account.provider),
      ),
    );
}

export async function markNeedsReauth(account: PlatformAccount) {
  await db
    .update(platformAccounts)
    .set({ needsReauth: true, lastSyncError: "reauth", updatedAt: new Date() })
    .where(
      and(
        eq(platformAccounts.userId, account.userId),
        eq(platformAccounts.provider, account.provider),
      ),
    );
}

export async function recordPlatformSync(
  account: PlatformAccount,
  result: { ok: true; at: Date } | { ok: false; error: string },
) {
  await db
    .update(platformAccounts)
    .set(
      result.ok
        ? { lastSyncedAt: result.at, lastSyncError: null, updatedAt: new Date() }
        : { lastSyncError: result.error, updatedAt: new Date() },
    )
    .where(
      and(
        eq(platformAccounts.userId, account.userId),
        eq(platformAccounts.provider, account.provider),
      ),
    );
}

/** Bağlantıyı kaldırır; kütüphane, oturumlar ve açılan başarımlar yerinde kalır. */
export async function unlinkPlatformAccount(userId: string, provider: LinkedProvider) {
  await db.transaction(async (tx) => {
    await tx
      .delete(platformAccounts)
      .where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.provider, provider)));
    await tx
      .delete(platformSnapshots)
      .where(and(eq(platformSnapshots.userId, userId), eq(platformSnapshots.provider, provider)));
  });
}

export async function setPlatformSyncEnabled(
  userId: string,
  provider: LinkedProvider,
  enabled: boolean,
) {
  const [row] = await db
    .update(platformAccounts)
    .set({ syncEnabled: enabled, updatedAt: new Date() })
    .where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.provider, provider)))
    .returning({ userId: platformAccounts.userId });
  if (!row) throw new AppError("not_found", "Bağlı hesap yok");
}

export async function requestPlatformSync(userId: string, provider: LinkedProvider) {
  const account = await getPlatformAccount(userId, provider);
  if (!account) throw new AppError("not_found", "Bağlı hesap yok");
  if (account.needsReauth) throw new PlatformReauthError(provider);
  await db.transaction((tx) => emit(tx, "platform.sync_requested", { userId, provider }));
}

/** Ayarlar sayfası için bağlı platformlar (token'lar asla dönmez). */
export async function platformStatuses(userId: string) {
  const rows = await db
    .select({
      provider: platformAccounts.provider,
      externalId: platformAccounts.externalId,
      displayName: platformAccounts.displayName,
      avatarUrl: platformAccounts.avatarUrl,
      needsReauth: platformAccounts.needsReauth,
      syncEnabled: platformAccounts.syncEnabled,
      lastSyncedAt: platformAccounts.lastSyncedAt,
      lastSyncError: platformAccounts.lastSyncError,
      credentialsExpireAt: platformAccounts.credentialsExpireAt,
    })
    .from(platformAccounts)
    .where(eq(platformAccounts.userId, userId));
  return rows;
}

/** Son senkronizasyonu `hours` saatten eski olan platform hesapları (cron kuyruğa atar). */
export async function platformAccountsDueForSync(hours = 6, limit = 500) {
  return db
    .select({ userId: platformAccounts.userId, provider: platformAccounts.provider })
    .from(platformAccounts)
    .where(
      and(
        eq(platformAccounts.syncEnabled, true),
        eq(platformAccounts.needsReauth, false),
        sql`(${platformAccounts.lastSyncedAt} is null or ${platformAccounts.lastSyncedAt} < now() - make_interval(hours => ${hours}))`,
      ),
    )
    .limit(limit);
}
