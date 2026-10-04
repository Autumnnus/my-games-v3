import {
  aiCostSummary,
  costRanges,
  listTraces,
  threadTrace,
  traceDetail,
} from "@my-games/core/admin/ai";
import { audit, auditRead, listAudit } from "@my-games/core/admin/audit";
import {
  legacyFileSchema,
  listLegacyImports,
  previewLegacyImport,
  startLegacyImport,
} from "@my-games/core/admin/legacy-import";
import { adminOverview } from "@my-games/core/admin/overview";
import {
  adminSettings,
  retryOutboxEvent,
  systemStatus,
  updateSettings,
} from "@my-games/core/admin/system";
import {
  adminUserDetail,
  adminUserFilters,
  adminUserSorts,
  banUser,
  deleteUserAccount,
  exportUserForAdmin,
  listUsers,
  purgeCategories,
  purgeUserData,
  resetUserOnboarding,
  revokeSessions,
  setStorageQuota,
  setUserLimits,
  unbanUser,
} from "@my-games/core/admin/users";
import {
  addKey,
  deleteKey,
  envKeys,
  listStoredKeys,
  reorderKeys,
  setKeyStrategy,
  testStoredKey,
  updateKey,
} from "@my-games/core/ai/keys";
import {
  aiStatus,
  modelSettings,
  modelSettingsSchema,
  setModelSettings,
} from "@my-games/core/ai/models";
import { priceTableSchema } from "@my-games/core/ai/pricing";
import { providerIds } from "@my-games/core/ai/providers";
import { usageSummaryToday } from "@my-games/core/ai/usage";
import { db } from "@my-games/core/db";
import { notFound } from "@my-games/core/errors";
import { listLogs, logSummary } from "@my-games/core/log";
import { adminStorageOverview, setDefaultQuota } from "@my-games/core/media";
import { listReports, resolveReport } from "@my-games/core/social/moderation";
import { Hono } from "hono";
import { z } from "zod";
import {
  type AppEnv,
  adminActor,
  requireAdmin,
  revokeUserAccess,
  withSession,
} from "../middleware";
import { uuidParam, validate } from "../validation";

/** Better Auth kullanıcı kimlikleri UUID değil (32 karakterlik rastgele dizi). */
const userParam = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });
const legacyImportSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  records: legacyFileSchema,
});

const providerName = z.string().regex(/^[a-z0-9-]{1,32}$/);
const keyName = z.string().trim().max(40).nullable().optional();
const newKeySchema = z.object({
  provider: providerName,
  // Sağlayıcı anahtarları boşluksuz, yazdırılabilir ASCII.
  key: z
    .string()
    .trim()
    .regex(/^[\x21-\x7e]{10,300}$/),
  name: keyName,
});
const keyPatchSchema = z
  .object({ name: keyName, enabled: z.boolean().optional() })
  .refine((value) => value.name !== undefined || value.enabled !== undefined);
const keyOrderSchema = z.object({ provider: providerName, ids: z.array(z.uuid()).min(1).max(100) });
const strategySchema = z.object({ strategy: z.enum(["round_robin", "failover"]).nullable() });

/** 10 TB'a kadar. */
const quotaBytes = z
  .number()
  .int()
  .min(0)
  .max(10 * 1024 ** 4);

/**
 * Yönetim API'si. Bütün route'lar tek kapının arkasında (`requireAdmin`, `*` üzerinde): burada tanımlanan
 * hiçbir route kapıyı atlayamaz. Admin olmayan her istek 404 alır. Değişiklik yapan her işlem ve sohbet içeriği
 * okumaları denetim kaydına yazılır.
 */
export const adminRoutes = new Hono<AppEnv>()
  .use("*", withSession, requireAdmin)
  .get("/overview", async (c) => c.json(await adminOverview()))

  // --- Kullanıcılar ---
  .get(
    "/users",
    validate(
      "query",
      z.object({
        q: z.string().max(100).optional(),
        filter: z.enum(adminUserFilters).optional(),
        sort: z.enum(adminUserSorts).optional(),
        page: z.coerce.number().int().min(1).max(10_000).optional(),
      }),
    ),
    async (c) => c.json(await listUsers(c.req.valid("query"))),
  )
  .get("/users/:id", validate("param", userParam), async (c) =>
    c.json(await adminUserDetail(c.req.valid("param").id)),
  )
  .get("/users/:id/export", validate("param", userParam), async (c) => {
    const data = await exportUserForAdmin(adminActor(c), c.req.valid("param").id);
    c.header("Content-Disposition", `attachment; filename="user-${c.req.valid("param").id}.json"`);
    return c.json(data);
  })
  .post(
    "/users/:id/ban",
    validate("param", userParam),
    validate(
      "json",
      z.object({
        reason: z.string().max(500).nullable().optional(),
        days: z.number().int().positive().max(3650).nullable().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      await banUser(adminActor(c), id, c.req.valid("json"));
      revokeUserAccess(id);
      return c.json({ ok: true });
    },
  )
  .post("/users/:id/onboarding/reset", validate("param", userParam), async (c) => {
    await resetUserOnboarding(adminActor(c), c.req.valid("param").id);
    return c.json({ ok: true });
  })
  // Eski sistemden aktarım: önizleme veritabanına yazmaz; başlatılınca worker aktarır.
  .get("/users/:id/legacy-imports", validate("param", userParam), async (c) =>
    c.json(await listLegacyImports(c.req.valid("param").id)),
  )
  .post(
    "/users/:id/legacy-imports/preview",
    validate("param", userParam),
    validate("json", legacyImportSchema),
    async (c) =>
      c.json(await previewLegacyImport(c.req.valid("param").id, c.req.valid("json").records)),
  )
  .post(
    "/users/:id/legacy-imports",
    validate("param", userParam),
    validate("json", legacyImportSchema),
    async (c) =>
      c.json(
        await startLegacyImport(adminActor(c), c.req.valid("param").id, c.req.valid("json")),
        201,
      ),
  )
  .post("/users/:id/unban", validate("param", userParam), async (c) => {
    await unbanUser(adminActor(c), c.req.valid("param").id);
    return c.json({ ok: true });
  })
  .post("/users/:id/sessions/revoke", validate("param", userParam), async (c) => {
    const { id } = c.req.valid("param");
    const result = await revokeSessions(adminActor(c), id);
    revokeUserAccess(id);
    return c.json(result);
  })
  .put(
    "/users/:id/storage-quota",
    validate("param", userParam),
    validate(
      "json",
      z.object({
        quotaBytes: quotaBytes.nullable(),
        note: z.string().max(500).nullable().optional(),
      }),
    ),
    async (c) => {
      const { quotaBytes: value, note } = c.req.valid("json");
      return c.json(await setStorageQuota(adminActor(c), c.req.valid("param").id, value, note));
    },
  )
  .put(
    "/users/:id/limits",
    validate("param", userParam),
    validate(
      "json",
      z.object({
        aiDailyTokens: z.number().int().min(0).max(100_000_000).nullable(),
        aiBlocked: z.boolean(),
        note: z.string().max(500).nullable().optional(),
      }),
    ),
    async (c) =>
      c.json({
        today: await setUserLimits(adminActor(c), c.req.valid("param").id, c.req.valid("json")),
      }),
  )
  .post(
    "/users/:id/purge",
    validate("param", userParam),
    validate(
      "json",
      z.object({ categories: z.array(z.enum(purgeCategories)).min(1).max(purgeCategories.length) }),
    ),
    async (c) =>
      c.json(
        await purgeUserData(adminActor(c), c.req.valid("param").id, c.req.valid("json").categories),
      ),
  )
  .delete(
    "/users/:id",
    validate("param", userParam),
    validate("json", z.object({ confirm: z.string().min(1).max(200) })),
    async (c) => {
      const { id } = c.req.valid("param");
      await deleteUserAccount(adminActor(c), id, c.req.valid("json").confirm);
      revokeUserAccess(id);
      return c.json({ ok: true });
    },
  )

  // --- Moderasyon ---
  .get(
    "/reports",
    validate("query", z.object({ status: z.enum(["open", "resolved", "dismissed"]).optional() })),
    async (c) => c.json({ reports: await listReports(c.req.valid("query").status ?? "open") }),
  )
  .post(
    "/reports/:id/resolve",
    validate("param", uuidParam),
    validate(
      "json",
      z.object({
        outcome: z.enum(["resolved", "dismissed"]),
        removeContent: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const actor = adminActor(c);
      const { id } = c.req.valid("param");
      const { outcome, removeContent } = c.req.valid("json");
      await resolveReport(actor.id, id, outcome, removeContent);
      await audit(db, actor, `report.${outcome}`, { type: "report", id }, { removeContent });
      return c.json({ ok: true });
    },
  )

  // --- Depolama ---
  .get("/storage", async (c) => c.json(await adminStorageOverview(50)))
  .put("/storage/default-quota", validate("json", z.object({ quotaBytes })), async (c) => {
    const { quotaBytes: value } = c.req.valid("json");
    const result = await setDefaultQuota(value);
    await audit(
      db,
      adminActor(c),
      "storage.default_quota",
      { type: "settings", id: "storage" },
      {
        quotaBytes: value,
      },
    );
    return c.json(result);
  })

  // --- AI ---
  .get("/ai", async (c) =>
    c.json({
      status: await aiStatus(),
      today: await usageSummaryToday(),
      keys: { stored: await listStoredKeys(), env: await envKeys(), providers: providerIds() },
    }),
  )
  // Anahtar havuzu: sır yalnızca eklerken gelir; yanıtlara ve denetim kaydına yalnızca ipucu (ilk/son 4) yazılır.
  .post("/ai/keys", validate("json", newKeySchema), async (c) => {
    const body = c.req.valid("json");
    const actor = adminActor(c);
    const added = await addKey({ ...body, actorId: actor.id });
    await audit(
      db,
      actor,
      "ai.key.add",
      { type: "ai_key", id: added.id, label: added.hint },
      { provider: added.provider, name: added.name, check: added.check.status },
    );
    return c.json({ id: added.id, check: added.check }, 201);
  })
  .patch(
    "/ai/keys/:id",
    validate("param", uuidParam),
    validate("json", keyPatchSchema),
    async (c) => {
      const patch = c.req.valid("json");
      const updated = await updateKey(c.req.valid("param").id, patch);
      await audit(
        db,
        adminActor(c),
        "ai.key.update",
        { type: "ai_key", id: c.req.valid("param").id, label: updated.hint ?? null },
        { provider: updated.provider, ...patch },
      );
      return c.json({ ok: true });
    },
  )
  .delete("/ai/keys/:id", validate("param", uuidParam), async (c) => {
    const removed = await deleteKey(c.req.valid("param").id);
    await audit(
      db,
      adminActor(c),
      "ai.key.delete",
      { type: "ai_key", id: removed.id, label: removed.hint },
      { provider: removed.provider, name: removed.name },
    );
    return c.json({ ok: true });
  })
  .post("/ai/keys/:id/test", validate("param", uuidParam), async (c) => {
    const result = await testStoredKey(c.req.valid("param").id);
    return c.json(result.check);
  })
  .put("/ai/keys/order", validate("json", keyOrderSchema), async (c) => {
    const { provider, ids } = c.req.valid("json");
    await reorderKeys(provider, ids);
    await audit(
      db,
      adminActor(c),
      "ai.key.reorder",
      { type: "settings", id: "ai" },
      { provider, ids },
    );
    return c.json({ ok: true });
  })
  .put("/ai/strategy", validate("json", strategySchema), async (c) => {
    const { strategy } = c.req.valid("json");
    const result = await setKeyStrategy(strategy);
    await audit(
      db,
      adminActor(c),
      "ai.key.strategy",
      { type: "settings", id: "ai" },
      { strategy: strategy ?? "env" },
    );
    return c.json(result);
  })
  .get("/ai/models", async (c) => c.json(await modelSettings()))
  .put("/ai/models", validate("json", modelSettingsSchema.nullable()), async (c) => {
    const value = c.req.valid("json");
    const result = await setModelSettings(value);
    await audit(
      db,
      adminActor(c),
      "ai.models",
      { type: "settings", id: "ai" },
      {
        models: value ?? "env",
      },
    );
    return c.json(result);
  })
  .get(
    "/ai/costs",
    validate("query", z.object({ range: z.enum(costRanges).optional() })),
    async (c) => c.json(await aiCostSummary(c.req.valid("query").range ?? "30d")),
  )
  .get(
    "/ai/traces",
    validate(
      "query",
      z.object({
        status: z.enum(["ok", "error", "aborted"]).optional(),
        purpose: z.enum(["chat", "title", "pick", "review", "recap"]).optional(),
        userId: userParam.shape.id.optional(),
        before: z.uuid().optional(),
      }),
    ),
    async (c) => c.json(await listTraces(c.req.valid("query"))),
  )
  .get("/ai/traces/:id", validate("param", uuidParam), async (c) => {
    const detail = await traceDetail(c.req.valid("param").id);
    // Sohbet içeriği (kullanıcının yazdıkları) okunduysa denetim kaydına geçer.
    if (detail.thread) {
      await auditRead(
        adminActor(c),
        "ai.thread.view",
        { type: "thread", id: detail.thread.id, label: detail.thread.title },
        { userId: detail.thread.user?.id ?? null },
      );
    }
    return c.json(detail);
  })
  .get("/ai/threads/:id", validate("param", uuidParam), async (c) => {
    const thread = await threadTrace(c.req.valid("param").id);
    if (!thread) notFound("Sohbet bulunamadı");
    await auditRead(
      adminActor(c),
      "ai.thread.view",
      { type: "thread", id: thread.id, label: thread.title },
      { userId: thread.user?.id ?? null },
    );
    return c.json({ thread });
  })

  // --- Sistem ---
  .get("/system", async (c) => c.json(await systemStatus()))
  .post(
    "/system/outbox/:id/retry",
    validate("param", z.object({ id: z.coerce.number().int().positive() })),
    async (c) => {
      await retryOutboxEvent(adminActor(c), c.req.valid("param").id);
      return c.json({ ok: true });
    },
  )
  .get(
    "/logs",
    validate(
      "query",
      z.object({
        level: z.enum(["info", "warn", "error", "problems"]).optional(),
        source: z.string().max(40).optional(),
        q: z.string().max(200).optional(),
        before: z.coerce.number().int().positive().optional(),
      }),
    ),
    async (c) => {
      const [page, summary] = await Promise.all([listLogs(c.req.valid("query")), logSummary(24)]);
      return c.json({ ...page, summary });
    },
  )
  .get(
    "/audit",
    validate(
      "query",
      z.object({
        targetType: z.string().max(40).optional(),
        targetId: z.string().max(100).optional(),
        before: z.uuid().optional(),
      }),
    ),
    async (c) => c.json(await listAudit(c.req.valid("query"))),
  )
  .get("/settings", async (c) => c.json(await adminSettings()))
  .put(
    "/settings",
    validate(
      "json",
      z.object({
        signupsOpen: z.boolean().optional(),
        aiDailyTokens: z.number().int().min(0).max(100_000_000).nullable().optional(),
        aiPrices: priceTableSchema.nullable().optional(),
      }),
    ),
    async (c) => c.json(await updateSettings(adminActor(c), c.req.valid("json"))),
  );

export type AdminAppType = typeof adminRoutes;
