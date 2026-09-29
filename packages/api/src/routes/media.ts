import {
  adminStorageOverview,
  adminUserStorage,
  cancelPendingAssets,
  setDefaultQuota,
  setUploadQuality,
  setUserQuota,
  storageUsage,
} from "@my-games/core/media";
import { confirmScreenshotUploads, createScreenshotUploads } from "@my-games/core/screenshots";
import { confirmAvatar, createAvatarUpload, removeAvatar } from "@my-games/core/users";
import { MAX_UPLOAD_BATCH, mediaVariantNames, uploadQualities } from "@my-games/shared";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import {
  type AppEnv,
  currentUser,
  rateLimit,
  requireAdmin,
  requireUser,
  withSession,
} from "../middleware";
import { uuidParam, validate } from "../validation";

const variantSchema = z.object({
  name: z.enum(mediaVariantNames),
  contentType: z.string().max(50),
  bytes: z.number().int().positive(),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
});
const variantsSchema = z.array(variantSchema).min(1).max(mediaVariantNames.length);

/** 10 TB'a kadar; `null` = varsayılana dön. */
const quotaBytes = z
  .number()
  .int()
  .min(0)
  .max(10 * 1024 ** 4);

/**
 * Oturum 5 dakika imzalı cookie'de önbelleklenir; avatar değişince cookie'yi tazeleriz ki yeni adres hemen
 * görünsün.
 */
async function refreshSessionCookie(c: Context<AppEnv>) {
  const { headers } = await auth.api.getSession({
    headers: c.req.raw.headers,
    query: { disableCookieCache: true },
    returnHeaders: true,
  });
  for (const cookie of headers.getSetCookie()) c.header("Set-Cookie", cookie, { append: true });
}

export const mediaRoutes = new Hono<AppEnv>()
  // --- Kullanıcının depolama alanı ---
  .get("/me/storage", withSession, requireUser, async (c) =>
    c.json(await storageUsage(currentUser(c).id)),
  )
  .patch(
    "/me/storage",
    withSession,
    requireUser,
    validate("json", z.object({ uploadQuality: z.enum(uploadQualities) })),
    async (c) => {
      await setUploadQuality(currentUser(c).id, c.req.valid("json").uploadQuality);
      return c.json(await storageUsage(currentUser(c).id));
    },
  )
  .post(
    "/me/uploads/cancel",
    withSession,
    requireUser,
    validate("json", z.object({ assetIds: z.array(z.uuid()).min(1).max(MAX_UPLOAD_BATCH) })),
    async (c) => {
      await cancelPendingAssets(currentUser(c).id, c.req.valid("json").assetIds);
      return c.json(await storageUsage(currentUser(c).id));
    },
  )
  // --- Avatar ---
  .post(
    "/me/avatar/uploads",
    withSession,
    requireUser,
    rateLimit("avatar", 10, 60 * 60_000),
    validate("json", z.object({ variants: variantsSchema })),
    async (c) =>
      c.json({ asset: await createAvatarUpload(currentUser(c).id, c.req.valid("json").variants) }),
  )
  .post(
    "/me/avatar",
    withSession,
    requireUser,
    validate("json", z.object({ assetId: z.uuid() })),
    async (c) => {
      const result = await confirmAvatar(currentUser(c).id, c.req.valid("json").assetId);
      await refreshSessionCookie(c);
      return c.json(result);
    },
  )
  .delete("/me/avatar", withSession, requireUser, async (c) => {
    await removeAvatar(currentUser(c).id);
    await refreshSessionCookie(c);
    return c.json({ ok: true });
  })
  // --- Screenshot yükleme ---
  .post(
    "/library/:id/screenshots/uploads",
    withSession,
    requireUser,
    rateLimit("upload", 60, 60 * 60_000),
    validate("param", uuidParam),
    validate(
      "json",
      z.object({
        quality: z.enum(uploadQualities),
        files: z
          .array(z.object({ variants: variantsSchema }))
          .min(1)
          .max(MAX_UPLOAD_BATCH),
      }),
    ),
    async (c) =>
      c.json({
        assets: await createScreenshotUploads(
          currentUser(c).id,
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      }),
  )
  .post(
    "/library/:id/screenshots",
    withSession,
    requireUser,
    validate("param", uuidParam),
    validate(
      "json",
      z.object({
        items: z
          .array(z.object({ assetId: z.uuid(), caption: z.string().max(500).optional() }))
          .min(1)
          .max(MAX_UPLOAD_BATCH),
      }),
    ),
    async (c) =>
      c.json(
        {
          screenshots: await confirmScreenshotUploads(
            currentUser(c).id,
            c.req.valid("param").id,
            c.req.valid("json").items,
          ),
        },
        201,
      ),
  )
  // --- Admin (arayüzü sonra) ---
  .get("/admin/storage", withSession, requireUser, requireAdmin, async (c) =>
    c.json(await adminStorageOverview()),
  )
  .put(
    "/admin/storage/default-quota",
    withSession,
    requireUser,
    requireAdmin,
    validate("json", z.object({ quotaBytes })),
    async (c) => c.json(await setDefaultQuota(c.req.valid("json").quotaBytes)),
  )
  .get("/admin/users/:id/storage", withSession, requireUser, requireAdmin, async (c) =>
    c.json(await adminUserStorage(c.req.param("id"))),
  )
  .put(
    "/admin/users/:id/storage-quota",
    withSession,
    requireUser,
    requireAdmin,
    validate(
      "json",
      z.object({
        quotaBytes: quotaBytes.nullable(),
        note: z.string().max(500).nullable().optional(),
      }),
    ),
    async (c) => {
      const { quotaBytes: value, note } = c.req.valid("json");
      return c.json(await setUserQuota(currentUser(c).id, c.req.param("id"), value, note));
    },
  );
