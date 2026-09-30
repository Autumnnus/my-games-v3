import { schema } from "@my-games/db";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { type DbOrTx, db } from "../db";

const { adminAudit, user } = schema;

/** İşlemi yapan admin. `ip` isteğin istemci adresi (Cloudflare arkasında `cf-connecting-ip`). */
export type AdminActor = { id: string; name: string; ip?: string | null };

export type AuditTarget = { type: string; id: string; label?: string | null };

/**
 * Admin işlemini kaydeder. Değişikliği yapan transaction içinde çağrılır: işlem geri alınırsa kayıt da düşer,
 * kayıt yazılamazsa işlem de olmaz.
 */
export async function audit(
  tx: DbOrTx,
  actor: AdminActor,
  action: string,
  target?: AuditTarget | null,
  details?: Record<string, unknown>,
) {
  await tx.insert(adminAudit).values({
    adminId: actor.id,
    adminName: actor.name,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    targetLabel: target?.label ?? null,
    details: details ?? null,
    ip: actor.ip ?? null,
  });
}

/**
 * Hassas okumalar (sohbet içeriği gibi) için: aynı admin aynı hedefi `windowMinutes` içinde zaten açtıysa
 * yeniden yazılmaz (sayfa yenilemeleri kaydı şişirmesin).
 */
export async function auditRead(
  actor: AdminActor,
  action: string,
  target: AuditTarget,
  details?: Record<string, unknown>,
  windowMinutes = 10,
) {
  const [recent] = await db
    .select({ id: adminAudit.id })
    .from(adminAudit)
    .where(
      and(
        eq(adminAudit.adminId, actor.id),
        eq(adminAudit.action, action),
        eq(adminAudit.targetId, target.id),
        gte(adminAudit.createdAt, new Date(Date.now() - windowMinutes * 60_000)),
      ),
    )
    .limit(1);
  if (!recent) await audit(db, actor, action, target, details);
}

export async function listAudit(input: {
  targetType?: string;
  targetId?: string;
  before?: string;
  limit?: number;
}) {
  const limit = Math.min(input.limit ?? 50, 100);
  const conditions = [];
  if (input.targetType) conditions.push(eq(adminAudit.targetType, input.targetType));
  if (input.targetId) conditions.push(eq(adminAudit.targetId, input.targetId));
  if (input.before) conditions.push(lt(adminAudit.id, input.before));
  const rows = await db
    .select({
      id: adminAudit.id,
      adminId: adminAudit.adminId,
      adminName: adminAudit.adminName,
      adminImage: user.image,
      action: adminAudit.action,
      targetType: adminAudit.targetType,
      targetId: adminAudit.targetId,
      targetLabel: adminAudit.targetLabel,
      details: adminAudit.details,
      ip: adminAudit.ip,
      createdAt: adminAudit.createdAt,
    })
    .from(adminAudit)
    .leftJoin(user, eq(user.id, adminAudit.adminId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adminAudit.id))
    .limit(limit + 1);
  return {
    entries: rows.slice(0, limit),
    nextBefore: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
  };
}
