import { importIgdbGame } from "@my-games/core/catalog";
import { AppError } from "@my-games/core/errors";
import { exportUserData } from "@my-games/core/export";
import {
  addEntry,
  deleteEntry,
  getEntry,
  librarySorts,
  listHistory,
  listLibrary,
  revertHistory,
  updateEntry,
} from "@my-games/core/library";
import {
  addExternalScreenshot,
  deleteScreenshot,
  listScreenshots,
  updateCaption,
} from "@my-games/core/screenshots";
import { findUserByUsername, getProfile } from "@my-games/core/users";
import { entryStatuses } from "@my-games/shared";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, currentUser, rateLimit, requireUser, withSession } from "../middleware";
import { entryFieldsSchema, toEntryFields, uuidParam, validate } from "../validation";

const libraryQuery = z.object({
  status: z.enum(entryStatuses).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(librarySorts).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  favorites: z
    .enum(["1", "true"])
    .transform(() => true)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const addEntrySchema = entryFieldsSchema.extend({
  gameId: z.uuid().optional(),
  igdbId: z.number().int().positive().optional(),
});

async function userIdOf(username: string) {
  const found = await findUserByUsername(username);
  if (!found) throw new AppError("not_found", "Kullanıcı bulunamadı");
  return found.id;
}

export const libraryRoutes = new Hono<AppEnv>()
  .get("/users/:username", async (c) => c.json(await getProfile(c.req.param("username"))))
  .get("/users/:username/library", validate("query", libraryQuery), async (c) => {
    const ownerId = await userIdOf(c.req.param("username"));
    return c.json(await listLibrary(ownerId, c.req.valid("query")));
  })
  .get("/users/:username/screenshots", async (c) => {
    const ownerId = await userIdOf(c.req.param("username"));
    return c.json({ screenshots: await listScreenshots({ userId: ownerId }) });
  })
  .get("/me/export", withSession, requireUser, rateLimit("export", 5, 60 * 60_000), async (c) => {
    const data = await exportUserData(currentUser(c).id);
    c.header(
      "Content-Disposition",
      `attachment; filename="my-games-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return c.json(data);
  })
  .post(
    "/library",
    withSession,
    requireUser,
    rateLimit("library-add", 120, 60 * 60_000),
    validate("json", addEntrySchema),
    async (c) => {
      const { gameId, igdbId, ...fields } = c.req.valid("json");
      const targetId = gameId ?? (igdbId ? (await importIgdbGame(igdbId)).id : undefined);
      if (!targetId) throw new AppError("invalid", "gameId veya igdbId gerekli");
      const entry = await addEntry(currentUser(c).id, {
        ...toEntryFields(fields),
        gameId: targetId,
      });
      return c.json({ entry: await getEntry(entry.id) }, 201);
    },
  )
  .get("/library/:id", validate("param", uuidParam), async (c) =>
    c.json({ entry: await getEntry(c.req.valid("param").id) }),
  )
  .patch(
    "/library/:id",
    withSession,
    requireUser,
    validate("param", uuidParam),
    validate("json", entryFieldsSchema.partial()),
    async (c) => {
      const { id } = c.req.valid("param");
      await updateEntry(currentUser(c).id, id, toEntryFields(c.req.valid("json")));
      return c.json({ entry: await getEntry(id) });
    },
  )
  .delete("/library/:id", withSession, requireUser, validate("param", uuidParam), async (c) => {
    await deleteEntry(currentUser(c).id, c.req.valid("param").id);
    return c.json({ ok: true });
  })
  .get(
    "/history",
    withSession,
    requireUser,
    validate("query", z.object({ entryId: z.uuid().optional() })),
    async (c) => c.json({ history: await listHistory(currentUser(c).id, c.req.valid("query")) }),
  )
  .post(
    "/history/:id/revert",
    withSession,
    requireUser,
    validate("param", uuidParam),
    async (c) => {
      await revertHistory(currentUser(c).id, c.req.valid("param").id);
      return c.json({ ok: true });
    },
  )
  // --- Screenshot'lar ---
  .get("/library/:id/screenshots", validate("param", uuidParam), async (c) =>
    c.json({ screenshots: await listScreenshots({ entryId: c.req.valid("param").id }) }),
  )
  .post(
    "/library/:id/screenshots/external",
    withSession,
    requireUser,
    rateLimit("screenshot-link", 60, 60 * 60_000),
    validate("param", uuidParam),
    validate(
      "json",
      z.object({ url: z.url(), caption: z.string().max(500).nullable().optional() }),
    ),
    async (c) =>
      c.json(
        {
          screenshot: await addExternalScreenshot(
            currentUser(c).id,
            c.req.valid("param").id,
            c.req.valid("json"),
          ),
        },
        201,
      ),
  )
  .patch(
    "/screenshots/:id",
    withSession,
    requireUser,
    validate("param", uuidParam),
    validate("json", z.object({ caption: z.string().max(500).nullable() })),
    async (c) =>
      c.json({
        screenshot: await updateCaption(
          currentUser(c).id,
          c.req.valid("param").id,
          c.req.valid("json").caption,
        ),
      }),
  )
  .delete("/screenshots/:id", withSession, requireUser, validate("param", uuidParam), async (c) => {
    const user = currentUser(c);
    await deleteScreenshot(user.id, c.req.valid("param").id, user.role === "admin");
    return c.json({ ok: true });
  });
