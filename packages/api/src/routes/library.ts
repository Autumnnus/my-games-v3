import { isAdmin } from "@my-games/core/admin/access";
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
import { libraryFilterSchema } from "@my-games/core/library-filter";
import { getProfileOverview, listUsers, userDirectorySorts } from "@my-games/core/profiles";
import {
  addExternalScreenshot,
  deleteScreenshot,
  listScreenshots,
  updateCaption,
} from "@my-games/core/screenshots";
import {
  createSmartList,
  deleteSmartList,
  getSmartList,
  listSmartLists,
  renameSmartList,
} from "@my-games/core/smart-lists";
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
  /** Akıllı liste: kayıtlı filtresi uygulanır (liste o kullanıcının olmalı). */
  list: z.uuid().optional(),
});

const usersQuery = z.object({
  q: z.string().trim().max(64).optional(),
  sort: z.enum(userDirectorySorts).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

/** Herkese açık ama birkaç toplamlı sorgu: IP/kullanıcı başına dakikada sınırlı (aramada yazarken de yeter). */
const directoryLimit = rateLimit("users", 120, 60_000);
const overviewLimit = rateLimit("profile-overview", 120, 60_000);

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
  .get("/users", withSession, directoryLimit, validate("query", usersQuery), async (c) =>
    c.json(await listUsers(c.req.valid("query"))),
  )
  .get("/users/:username", async (c) => c.json(await getProfile(c.req.param("username"))))
  .get("/users/:username/overview", withSession, overviewLimit, async (c) =>
    c.json(await getProfileOverview(c.req.param("username"))),
  )
  .get("/users/:username/library", validate("query", libraryQuery), async (c) => {
    const ownerId = await userIdOf(c.req.param("username"));
    const { list, ...query } = c.req.valid("query");
    if (!list) return c.json(await listLibrary(ownerId, query));
    const smart = await getSmartList(list);
    if (smart.userId !== ownerId) throw new AppError("not_found", "Liste bulunamadı");
    return c.json(
      await listLibrary(ownerId, {
        ...query,
        filter: smart.filter,
        sort: query.sort ?? smart.sort ?? undefined,
      }),
    );
  })
  .get("/users/:username/lists", async (c) => {
    const ownerId = await userIdOf(c.req.param("username"));
    return c.json({ lists: await listSmartLists(ownerId) });
  })
  .post(
    "/lists",
    withSession,
    requireUser,
    rateLimit("lists", 30, 60 * 60_000),
    validate(
      "json",
      z.object({
        name: z.string().trim().min(1).max(60),
        filter: libraryFilterSchema,
        sort: z.enum(librarySorts).nullable().optional(),
        source: z.enum(["ai", "manual"]).optional(),
      }),
    ),
    async (c) => {
      const list = await createSmartList(currentUser(c).id, c.req.valid("json"));
      return c.json({ list }, 201);
    },
  )
  .patch(
    "/lists/:id",
    withSession,
    requireUser,
    validate("param", uuidParam),
    validate("json", z.object({ name: z.string().trim().min(1).max(60) })),
    async (c) => {
      const list = await renameSmartList(
        currentUser(c).id,
        c.req.valid("param").id,
        c.req.valid("json").name,
      );
      return c.json({ list });
    },
  )
  .delete("/lists/:id", withSession, requireUser, validate("param", uuidParam), async (c) => {
    await deleteSmartList(currentUser(c).id, c.req.valid("param").id);
    return c.json({ ok: true });
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
    await deleteScreenshot(
      user.id,
      c.req.valid("param").id,
      user.role === "admin" && (await isAdmin(user.id)),
    );
    return c.json({ ok: true });
  });
