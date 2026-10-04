import { schema } from "@my-games/db";
import { and, count, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { usageToday } from "../ai/usage";
import { db } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { exportUserData } from "../export";
import { adminUserStorage, discardAssets, setUserQuota } from "../media";
import { onboardingOf, resetOnboarding } from "../onboarding";
import { aiCostByUser, listTraces, userAiSummary } from "./ai";
import { type AdminActor, audit, listAudit } from "./audit";

const {
  user,
  session,
  account,
  libraryEntries,
  screenshots,
  mediaAssets,
  chatThreads,
  aiRecaps,
  reactions,
  activities,
  notifications,
  smartLists,
  entryHistory,
  playSessions,
  userAchievements,
  steamAccounts,
  platformAccounts,
  platformSnapshots,
  syncRuns,
  changeProposals,
  syncIgnores,
  userLimits,
} = schema;

type UserRow = typeof user.$inferSelect;

/** Kayıtlarda ve onay metninde kullanılan ad: `@kullanıcıadı`, yoksa e-posta. */
function labelOf(row: Pick<UserRow, "displayUsername" | "username" | "email">) {
  const name = row.displayUsername ?? row.username;
  return name ? `@${name}` : row.email;
}

/**
 * İşlemin hedefi. Admin hesaplarına ve kendine yıkıcı işlem uygulanamaz: bir admin oturumu ele geçirilse bile
 * diğer adminleri silemez/banlayamaz. Admin yetkisi yalnızca sunucudaki komutla verilir/alınır.
 */
async function targetUser(
  actor: AdminActor,
  userId: string,
  options: { allowAdmin?: boolean; allowSelf?: boolean } = {},
) {
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  if (!row) notFound("Kullanıcı bulunamadı");
  if (!options.allowSelf && row.id === actor.id) forbidden("Bu işlem kendi hesabına uygulanamaz");
  if (!options.allowAdmin && row.role === "admin" && row.id !== actor.id) {
    forbidden("Admin hesaplarına uygulanamaz");
  }
  return row;
}

// --- Liste ---

export const adminUserFilters = ["all", "admins", "banned", "unverified"] as const;
export const adminUserSorts = ["newest", "oldest", "active", "entries", "storage"] as const;
export type AdminUserFilter = (typeof adminUserFilters)[number];
export type AdminUserSort = (typeof adminUserSorts)[number];

const PAGE_SIZE = 50;

const lastSeen = sql<Date | null>`(select max(s.updated_at) from "session" s where s.user_id = "user"."id")`;
const entryCount = sql<number>`(select count(*)::int from library_entries e where e.user_id = "user"."id")`;
const storageBytes = sql<number>`(select coalesce(sum(a.total_bytes), 0)::float8 from media_assets a where a.user_id = "user"."id" and a.target_id is null)`;

export async function listUsers(input: {
  q?: string;
  filter?: AdminUserFilter;
  sort?: AdminUserSort;
  page?: number;
}) {
  const page = Math.max(1, input.page ?? 1);
  const conditions: SQL[] = [];
  const q = input.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/^@/, "").replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const match = or(
      ilike(user.name, pattern),
      ilike(user.email, pattern),
      ilike(user.username, pattern),
    );
    if (match) conditions.push(match);
  }
  if (input.filter === "admins") conditions.push(eq(user.role, "admin"));
  if (input.filter === "banned") conditions.push(eq(user.banned, true));
  if (input.filter === "unverified") conditions.push(eq(user.emailVerified, false));
  const where = conditions.length ? and(...conditions) : undefined;

  const order = {
    newest: [desc(user.createdAt)],
    oldest: [user.createdAt],
    active: [sql`${lastSeen} desc nulls last`],
    entries: [sql`${entryCount} desc`],
    storage: [sql`${storageBytes} desc`],
  }[input.sort ?? "newest"];

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.displayUsername,
        image: user.image,
        role: user.role,
        banned: user.banned,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        lastSeenAt: lastSeen,
        entries: entryCount,
        storageBytes,
      })
      .from(user)
      .where(where)
      .orderBy(...order, desc(user.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ count: count() }).from(user).where(where),
  ]);
  const ai = await aiCostByUser(rows.map((row) => row.id));
  return {
    users: rows.map((row) => ({
      ...row,
      role: row.role ?? "user",
      banned: row.banned ?? false,
      aiTokens30d: ai.get(row.id)?.tokens ?? 0,
      aiCost30d: ai.get(row.id)?.cost ?? 0,
    })),
    total: total?.count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

// --- Ayrıntı ---

type DataCounts = {
  entries: number;
  screenshots: number;
  uploads: number;
  history: number;
  playSessions: number;
  achievements: number;
  smartLists: number;
  threads: number;
  comments: number;
  reactions: number;
  activities: number;
  notifications: number;
  platforms: number;
  proposals: number;
  reportsFiled: number;
};

async function dataCounts(userId: string): Promise<DataCounts> {
  const { rows } = await db.execute<DataCounts>(sql`select
    (select count(*)::int from library_entries where user_id = ${userId}) as "entries",
    (select count(*)::int from screenshots where user_id = ${userId}) as "screenshots",
    (select count(*)::int from media_assets where user_id = ${userId} and purpose = 'screenshot') as "uploads",
    (select count(*)::int from entry_history where user_id = ${userId}) as "history",
    (select count(*)::int from play_sessions where user_id = ${userId}) as "playSessions",
    (select count(*)::int from user_achievements where user_id = ${userId}) as "achievements",
    (select count(*)::int from smart_lists where user_id = ${userId}) as "smartLists",
    (select count(*)::int from chat_threads where user_id = ${userId}) as "threads",
    (select count(*)::int from comments where author_id = ${userId} and deleted_at is null) as "comments",
    (select count(*)::int from reactions where user_id = ${userId}) as "reactions",
    (select count(*)::int from activities where actor_id = ${userId}) as "activities",
    (select count(*)::int from notifications where recipient_id = ${userId}) as "notifications",
    ((select count(*)::int from steam_accounts where user_id = ${userId})
      + (select count(*)::int from platform_accounts where user_id = ${userId})) as "platforms",
    (select count(*)::int from change_proposals where user_id = ${userId}) as "proposals",
    (select count(*)::int from reports where reporter_id = ${userId}) as "reportsFiled"`);
  const row = rows[0];
  if (!row) throw new Error("sayım başarısız");
  return row;
}

export async function adminUserDetail(userId: string) {
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  if (!row) notFound("Kullanıcı bulunamadı");
  const [
    accounts,
    sessions,
    counts,
    storage,
    [limits],
    quota,
    ai,
    threads,
    runs,
    history,
    onboarding,
  ] = await Promise.all([
    db
      .select({ providerId: account.providerId, createdAt: account.createdAt })
      .from(account)
      .where(eq(account.userId, userId)),
    db
      .select({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, userId))
      .orderBy(desc(session.updatedAt))
      .limit(20),
    dataCounts(userId),
    adminUserStorage(userId),
    db.select().from(userLimits).where(eq(userLimits.userId, userId)),
    usageToday(userId),
    userAiSummary(userId),
    db
      .select({
        id: chatThreads.id,
        title: chatThreads.title,
        createdAt: chatThreads.createdAt,
        updatedAt: chatThreads.updatedAt,
        // Alt sorguda sütunlar elle nitelenir (drizzle `sql` içinde tablo adını yazmaz).
        messages: sql<number>`(select count(*)::int from chat_messages m where m.thread_id = "chat_threads"."id")`,
      })
      .from(chatThreads)
      .where(eq(chatThreads.userId, userId))
      .orderBy(desc(chatThreads.updatedAt))
      .limit(30),
    listTraces({ userId, limit: 8 }),
    listAudit({ targetType: "user", targetId: userId, limit: 20 }),
    onboardingOf(userId),
  ]);
  return {
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      emailVerified: row.emailVerified,
      username: row.displayUsername ?? row.username,
      image: row.image,
      bio: row.bio,
      locale: row.locale,
      role: row.role ?? "user",
      banned: row.banned ?? false,
      banReason: row.banReason,
      banExpires: row.banExpires,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    accounts,
    sessions,
    counts,
    storage,
    limits: {
      aiDailyTokens: limits?.aiDailyTokens ?? null,
      aiBlocked: limits?.aiBlocked ?? false,
      note: limits?.note ?? null,
      updatedAt: limits?.updatedAt ?? null,
    },
    ai: { today: quota, last30d: ai, threads, runs: runs.traces },
    audit: history.entries,
    onboarding: onboarding && {
      welcomedAt: onboarding.welcomedAt,
      dismissedAt: onboarding.dismissedAt,
      completedAt: onboarding.completedAt,
      seenTips: onboarding.seenTips,
      startedAt: onboarding.createdAt,
    },
  };
}

/** Yeni üye rehberini baştan başlatır (destek ya da admin'in kendi hesabında denemesi için). */
export async function resetUserOnboarding(actor: AdminActor, userId: string) {
  const target = await targetUser(actor, userId, { allowAdmin: true, allowSelf: true });
  await db.transaction(async (tx) => {
    await resetOnboarding(userId, tx);
    await audit(tx, actor, "user.onboarding_reset", {
      type: "user",
      id: userId,
      label: labelOf(target),
    });
  });
}

export async function exportUserForAdmin(actor: AdminActor, userId: string) {
  const target = await targetUser(actor, userId, { allowAdmin: true, allowSelf: true });
  const data = await exportUserData(userId);
  await audit(db, actor, "user.export", { type: "user", id: userId, label: labelOf(target) });
  return data;
}

// --- Moderasyon ---

export async function banUser(
  actor: AdminActor,
  userId: string,
  input: { reason?: string | null; days?: number | null },
) {
  const target = await targetUser(actor, userId);
  const expires = input.days ? new Date(Date.now() + input.days * 86_400_000) : null;
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ banned: true, banReason: input.reason?.trim() || null, banExpires: expires })
      .where(eq(user.id, userId));
    // Açık oturumlar kapanır; çerez önbelleğindeki oturumları API katmanı ayrıca düşürür.
    await tx.delete(session).where(eq(session.userId, userId));
    await audit(
      tx,
      actor,
      "user.ban",
      { type: "user", id: userId, label: labelOf(target) },
      { reason: input.reason ?? null, days: input.days ?? null },
    );
  });
}

export async function unbanUser(actor: AdminActor, userId: string) {
  const target = await targetUser(actor, userId);
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ banned: false, banReason: null, banExpires: null })
      .where(eq(user.id, userId));
    await audit(tx, actor, "user.unban", { type: "user", id: userId, label: labelOf(target) });
  });
}

/** Bütün cihazlardan çıkış (şifre sızıntısı şüphesi gibi durumlar için). */
export async function revokeSessions(actor: AdminActor, userId: string) {
  const target = await targetUser(actor, userId);
  return db.transaction(async (tx) => {
    const rows = await tx
      .delete(session)
      .where(eq(session.userId, userId))
      .returning({ id: session.id });
    await audit(
      tx,
      actor,
      "user.sessions_revoke",
      { type: "user", id: userId, label: labelOf(target) },
      { sessions: rows.length },
    );
    return { revoked: rows.length };
  });
}

// --- Sınırlar ---

export async function setStorageQuota(
  actor: AdminActor,
  userId: string,
  quotaBytes: number | null,
  note?: string | null,
) {
  const target = await targetUser(actor, userId, { allowAdmin: true, allowSelf: true });
  const result = await setUserQuota(actor.id, userId, quotaBytes, note);
  await audit(
    db,
    actor,
    "user.storage_quota",
    { type: "user", id: userId, label: labelOf(target) },
    { quotaBytes, note: note ?? null },
  );
  return result;
}

export async function setUserLimits(
  actor: AdminActor,
  userId: string,
  input: { aiDailyTokens: number | null; aiBlocked: boolean; note?: string | null },
) {
  const target = await targetUser(actor, userId, { allowAdmin: true, allowSelf: true });
  const values = {
    aiDailyTokens: input.aiDailyTokens,
    aiBlocked: input.aiBlocked,
    note: input.note?.trim() || null,
    updatedBy: actor.id,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(userLimits)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: userLimits.userId, set: values });
    await audit(
      tx,
      actor,
      "user.ai_limits",
      { type: "user", id: userId, label: labelOf(target) },
      { aiDailyTokens: input.aiDailyTokens, aiBlocked: input.aiBlocked },
    );
  });
  return usageToday(userId);
}

// --- Veri silme ---

export const purgeCategories = [
  "library",
  "screenshots",
  "ai",
  "social",
  "platforms",
  "profile",
] as const;
export type PurgeCategory = (typeof purgeCategories)[number];

/**
 * Kullanıcının seçilen verilerini siler; hesap kalır. Tek transaction: ya hepsi ya hiçbiri. Yüklenen dosyalar
 * depodan worker tarafından silinir (kota hemen geri gelir). Akış/beğeni/bildirim artıkları veritabanı
 * tetikleyicileriyle temizlenir.
 * - `library`: kütüphane kayıtları (ve onlara bağlı ekran görüntüleri), geçmiş, oyun oturumları, başarımlar,
 *   akıllı listeler.
 * - `screenshots`: bütün ekran görüntüleri ve dosyaları.
 * - `ai`: AI sohbetleri ve "kaldığın yer" özetleri. Kullanım/maliyet satırları içerik taşımadığı için kalır.
 * - `social`: yorumlar (başkalarının yanıtladığı yorumun metni silinir, yeri kalır), beğeniler, akış
 *   kayıtları, bildirimler.
 * - `platforms`: Steam/PSN/Xbox bağlantıları, senkronizasyon geçmişi ve onay bekleyen öneriler.
 * - `profile`: avatar ve biyografi.
 */
export async function purgeUserData(
  actor: AdminActor,
  userId: string,
  categories: PurgeCategory[],
) {
  const selected = new Set(categories);
  if (selected.size === 0) throw new AppError("invalid", "Silinecek veri seçilmedi");
  const target = await targetUser(actor, userId);
  const removed: Record<string, number> = {};
  const deleted = async (rows: Promise<unknown[]>) => (await rows).length;

  await db.transaction(async (tx) => {
    if (selected.has("screenshots") || selected.has("library")) {
      const [shots] = await tx
        .select({ count: count() })
        .from(screenshots)
        .where(eq(screenshots.userId, userId));
      const uploads = await tx
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.userId, userId), eq(mediaAssets.purpose, "screenshot")));
      await discardAssets(tx, uploads);
      await tx.delete(screenshots).where(eq(screenshots.userId, userId));
      removed.screenshots = shots?.count ?? 0;
      removed.files = uploads.length;
    }
    if (selected.has("library")) {
      removed.entries = await deleted(
        tx
          .delete(libraryEntries)
          .where(eq(libraryEntries.userId, userId))
          .returning({ id: libraryEntries.id }),
      );
      removed.history = await deleted(
        tx
          .delete(entryHistory)
          .where(eq(entryHistory.userId, userId))
          .returning({ id: entryHistory.id }),
      );
      removed.playSessions = await deleted(
        tx
          .delete(playSessions)
          .where(eq(playSessions.userId, userId))
          .returning({ id: playSessions.id }),
      );
      removed.achievements = await deleted(
        tx
          .delete(userAchievements)
          .where(eq(userAchievements.userId, userId))
          .returning({ userId: userAchievements.userId }),
      );
      removed.smartLists = await deleted(
        tx.delete(smartLists).where(eq(smartLists.userId, userId)).returning({ id: smartLists.id }),
      );
    }
    if (selected.has("ai")) {
      removed.threads = await deleted(
        tx
          .delete(chatThreads)
          .where(eq(chatThreads.userId, userId))
          .returning({ id: chatThreads.id }),
      );
      await tx.delete(aiRecaps).where(eq(aiRecaps.userId, userId));
    }
    if (selected.has("social")) {
      // Başkasının yanıtladığı yorum silinirse yanıtlar sahipsiz kalır; metni boşaltılıp yer tutucu bırakılır.
      await tx.execute(sql`update comments c set body = '', deleted_at = coalesce(c.deleted_at, now())
        where c.author_id = ${userId}
          and exists (select 1 from comments r where r.parent_id = c.id and r.author_id <> ${userId})`);
      const comments = await tx.execute(sql`delete from comments c
        where c.author_id = ${userId}
          and not exists (select 1 from comments r where r.parent_id = c.id and r.author_id <> ${userId})
        returning c.id`);
      removed.comments = comments.rowCount ?? 0;
      removed.reactions = await deleted(
        tx
          .delete(reactions)
          .where(eq(reactions.userId, userId))
          .returning({ userId: reactions.userId }),
      );
      removed.activities = await deleted(
        tx
          .delete(activities)
          .where(eq(activities.actorId, userId))
          .returning({ id: activities.id }),
      );
      removed.notifications = await deleted(
        tx
          .delete(notifications)
          .where(eq(notifications.recipientId, userId))
          .returning({ id: notifications.id }),
      );
    }
    if (selected.has("platforms")) {
      removed.platforms =
        (await deleted(
          tx
            .delete(steamAccounts)
            .where(eq(steamAccounts.userId, userId))
            .returning({ userId: steamAccounts.userId }),
        )) +
        (await deleted(
          tx
            .delete(platformAccounts)
            .where(eq(platformAccounts.userId, userId))
            .returning({ userId: platformAccounts.userId }),
        ));
      await tx.delete(platformSnapshots).where(eq(platformSnapshots.userId, userId));
      await tx.delete(syncRuns).where(eq(syncRuns.userId, userId));
      await tx.delete(syncIgnores).where(eq(syncIgnores.userId, userId));
      removed.proposals = await deleted(
        tx
          .delete(changeProposals)
          .where(eq(changeProposals.userId, userId))
          .returning({ id: changeProposals.id }),
      );
    }
    if (selected.has("profile")) {
      const avatars = await tx
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.userId, userId), eq(mediaAssets.purpose, "avatar")));
      await discardAssets(tx, avatars);
      await tx.update(user).set({ image: null, bio: null }).where(eq(user.id, userId));
      removed.avatar = avatars.length;
    }
    await audit(
      tx,
      actor,
      "user.purge",
      { type: "user", id: userId, label: labelOf(target) },
      { categories: [...selected], removed },
    );
  });
  return { removed };
}

/**
 * Hesabı ve bütün verisini siler. Onay için kullanıcı adı (yoksa e-posta) aynen yazılmalı. Silinen kişinin
 * e-postası denetim kaydına yazılmaz (silinme hakkı); yalnızca kullanıcı adı kalır.
 */
export async function deleteUserAccount(actor: AdminActor, userId: string, confirm: string) {
  const target = await targetUser(actor, userId);
  const expected = labelOf(target).replace(/^@/, "").toLowerCase();
  if (confirm.trim().replace(/^@/, "").toLowerCase() !== expected) {
    throw new AppError("invalid", "Onay metni eşleşmiyor");
  }
  const counts = await dataCounts(userId);
  await db.transaction(async (tx) => {
    // Satırlar cascade ile gider; dosyalar önce temizlik kuyruğuna alınır.
    const assets = await tx.select().from(mediaAssets).where(eq(mediaAssets.userId, userId));
    await discardAssets(tx, assets);
    await tx.delete(user).where(eq(user.id, userId));
    await audit(
      tx,
      actor,
      "user.delete",
      { type: "user", id: userId, label: labelOf(target) },
      { entries: counts.entries, screenshots: counts.screenshots, threads: counts.threads },
    );
  });
}
