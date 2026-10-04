import { schema } from "@my-games/db";
import {
  type OnboardingStep,
  type OnboardingTip,
  onboardingSteps,
  onboardingTips,
} from "@my-games/shared";
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { aiEnabled } from "./ai/keys";
import { features } from "./config";
import { type DbOrTx, db } from "./db";

const { userOnboarding } = schema;

/** Rehber kayıttan sonra bu kadar gün açık kalır; sonra yarım kalsa da bir daha gösterilmez. */
export const ONBOARDING_DAYS = 30;

const windowStart = () => new Date(Date.now() - ONBOARDING_DAYS * 24 * 60 * 60_000);

/** Kayıt anında çağrılır (Better Auth `user.create.after`). Eski hesaplarda satır olmadığı için rehber çıkmaz. */
export async function startOnboarding(userId: string, tx: DbOrTx = db) {
  await tx.insert(userOnboarding).values({ userId }).onConflictDoNothing();
}

/** Admin: rehberi baştan başlatır (pencere de yeniden açılır). */
export async function resetOnboarding(userId: string, tx: DbOrTx = db) {
  const now = new Date();
  await tx
    .insert(userOnboarding)
    .values({ userId, createdAt: now })
    .onConflictDoUpdate({
      target: userOnboarding.userId,
      set: { welcomedAt: null, dismissedAt: null, completedAt: null, seenTips: [], createdAt: now },
    });
}

/** Her adımın görünürlüğü ve tamamlanma durumu tek sorguda, veriden hesaplanır. */
const stepFlags = (userIdSql: ReturnType<typeof sql>) => ({
  platform: sql<boolean>`(exists (select 1 from steam_accounts s where s.user_id = ${userIdSql})
    or exists (select 1 from platform_accounts p where p.user_id = ${userIdSql}))`,
  // Kullanıcı en az bir öneriyi kendisi onaylayıp reddetti ya da senkron bitti ve bekleyen öneri kalmadı.
  inbox: sql<boolean>`(exists (select 1 from change_proposals c where c.user_id = ${userIdSql}
      and c.status in ('approved', 'rejected'))
    or ((exists (select 1 from steam_accounts s where s.user_id = ${userIdSql} and s.last_synced_at is not null)
        or exists (select 1 from platform_accounts p where p.user_id = ${userIdSql} and p.last_synced_at is not null))
      and not exists (select 1 from change_proposals c where c.user_id = ${userIdSql} and c.status = 'pending')))`,
  game: sql<boolean>`exists (select 1 from library_entries e where e.user_id = ${userIdSql})`,
  ai: sql<boolean>`exists (select 1 from chat_threads t where t.user_id = ${userIdSql})`,
  profile: sql<boolean>`exists (select 1 from "user" u where u.id = ${userIdSql}
    and (u.image is not null or coalesce(btrim(u.bio), '') <> ''))`,
});

type Availability = { platforms: boolean; ai: boolean };

async function availability(): Promise<Availability> {
  const flags = features();
  return { platforms: flags.steam || flags.psn || flags.xbox, ai: await aiEnabled() };
}

/** Kurulumu kapalı olan özelliklerin adımı listede yer almaz; gelen kutusu adımı platform bağlanınca görünür. */
function visibleSteps(done: Record<OnboardingStep, boolean>, available: Availability) {
  return onboardingSteps.filter((step) => {
    if (step === "platform") return available.platforms;
    if (step === "inbox") return available.platforms && done.platform;
    if (step === "ai") return available.ai;
    return true;
  });
}

export type OnboardingState = {
  welcomed: boolean;
  dismissed: boolean;
  /** Bu istekte son adım da bitti: istemci bir kez kutlar. */
  justCompleted: boolean;
  steps: Array<{ id: OnboardingStep; done: boolean }>;
  seenTips: OnboardingTip[];
  /** Rehberin kapanacağı an (kayıt + `ONBOARDING_DAYS`). */
  endsAt: string;
};

/**
 * Kullanıcının rehber durumu. Rehber yoksa (eski hesap, süresi doldu ya da tamamlandı) `null` döner; böylece
 * istemci hiçbir şey göstermez.
 */
export async function getOnboarding(userId: string): Promise<OnboardingState | null> {
  const id = sql`${userId}`;
  const flags = stepFlags(id);
  const [row] = await db
    .select({
      welcomedAt: userOnboarding.welcomedAt,
      dismissedAt: userOnboarding.dismissedAt,
      completedAt: userOnboarding.completedAt,
      seenTips: userOnboarding.seenTips,
      createdAt: userOnboarding.createdAt,
      ...flags,
    })
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId));
  if (!row || row.completedAt) return null;
  if (row.createdAt < windowStart()) return null;

  const done: Record<OnboardingStep, boolean> = {
    platform: row.platform,
    inbox: row.inbox,
    game: row.game,
    ai: row.ai,
    profile: row.profile,
  };
  const steps = visibleSteps(done, await availability()).map((step) => ({
    id: step,
    done: done[step],
  }));

  let justCompleted = false;
  if (steps.every((step) => step.done)) {
    // Yarışta iki istek birden tamamlamasın: yalnızca `completed_at`'i boşken yazan kutlar.
    const updated = await db
      .update(userOnboarding)
      .set({ completedAt: new Date() })
      .where(and(eq(userOnboarding.userId, userId), isNull(userOnboarding.completedAt)))
      .returning({ userId: userOnboarding.userId });
    justCompleted = updated.length > 0;
  }

  const endsAt = new Date(row.createdAt.getTime() + ONBOARDING_DAYS * 24 * 60 * 60_000);
  return {
    welcomed: row.welcomedAt !== null,
    dismissed: row.dismissedAt !== null,
    justCompleted,
    steps,
    seenTips: row.seenTips.filter((tip): tip is OnboardingTip =>
      (onboardingTips as readonly string[]).includes(tip),
    ),
    endsAt: endsAt.toISOString(),
  };
}

export async function markWelcomed(userId: string) {
  await db
    .update(userOnboarding)
    .set({ welcomedAt: new Date() })
    .where(and(eq(userOnboarding.userId, userId), isNull(userOnboarding.welcomedAt)));
}

/** Liste gizlenir; ipuçları da artık gösterilmez (kullanıcı rehber istemiyor). */
export async function dismissOnboarding(userId: string) {
  const now = new Date();
  await db
    .update(userOnboarding)
    .set({ dismissedAt: now, welcomedAt: sql`coalesce(${userOnboarding.welcomedAt}, ${now})` })
    .where(eq(userOnboarding.userId, userId));
}

/** Gizlenen listeyi geri getirir (kullanıcı menüsünden). */
export async function restoreOnboarding(userId: string) {
  await db
    .update(userOnboarding)
    .set({ dismissedAt: null })
    .where(eq(userOnboarding.userId, userId));
}

export async function markTipSeen(userId: string, tip: OnboardingTip) {
  await db
    .update(userOnboarding)
    .set({ seenTips: sql`array_append(${userOnboarding.seenTips}, ${tip})` })
    .where(
      and(eq(userOnboarding.userId, userId), sql`not (${tip} = any(${userOnboarding.seenTips}))`),
    );
}

/** Admin: tek kullanıcının rehber durumu (pencere/tamamlanma fark etmeksizin). */
export async function onboardingOf(userId: string) {
  const [row] = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId));
  return row ?? null;
}

/** Admin hunisi: son `days` günde kaydolan (rehberi olan) üyelerin her adımı tamamlama oranı. */
export async function onboardingFunnel(days = ONBOARDING_DAYS) {
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);
  const flags = stepFlags(sql`${userOnboarding.userId}`);
  const [row] = await db
    .select({
      total: count(),
      welcomed: count(userOnboarding.welcomedAt),
      dismissed: count(userOnboarding.dismissedAt),
      completed: count(userOnboarding.completedAt),
      platform: sql<number>`count(*) filter (where ${flags.platform})`.mapWith(Number),
      inbox: sql<number>`count(*) filter (where ${flags.inbox})`.mapWith(Number),
      game: sql<number>`count(*) filter (where ${flags.game})`.mapWith(Number),
      ai: sql<number>`count(*) filter (where ${flags.ai})`.mapWith(Number),
      profile: sql<number>`count(*) filter (where ${flags.profile})`.mapWith(Number),
    })
    .from(userOnboarding)
    .where(gte(userOnboarding.createdAt, since));
  const available = await availability();
  return {
    days,
    total: row?.total ?? 0,
    welcomed: row?.welcomed ?? 0,
    dismissed: row?.dismissed ?? 0,
    completed: row?.completed ?? 0,
    steps: onboardingSteps
      .filter((step) => (step === "platform" || step === "inbox" ? available.platforms : true))
      .filter((step) => (step === "ai" ? available.ai : true))
      .map((step) => ({ id: step, done: row?.[step] ?? 0 })),
  };
}
