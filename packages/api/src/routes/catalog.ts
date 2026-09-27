import {
  createCustomGame,
  getGameBySlug,
  importIgdbGame,
  searchCatalog,
} from "@my-games/core/catalog";
import { listScreenshots } from "@my-games/core/screenshots";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, currentUser, rateLimit, requireUser, withSession } from "../middleware";
import { validate } from "../validation";

export const catalogRoutes = new Hono<AppEnv>()
  // IGDB kotasını korumak için arama sadece giriş yapmış kullanıcılara açık.
  .get(
    "/catalog/search",
    withSession,
    requireUser,
    rateLimit("search", 60, 60_000),
    validate("query", z.object({ q: z.string().min(2).max(100) })),
    async (c) => {
      const { q } = c.req.valid("query");
      return c.json({ results: await searchCatalog(q, currentUser(c).id) });
    },
  )
  .post(
    "/catalog/import",
    withSession,
    requireUser,
    rateLimit("import", 30, 60_000),
    validate("json", z.object({ igdbId: z.number().int().positive() })),
    async (c) => {
      const game = await importIgdbGame(c.req.valid("json").igdbId);
      return c.json({ game: { id: game.id, slug: game.slug, name: game.name } });
    },
  )
  .post(
    "/catalog/custom",
    withSession,
    requireUser,
    rateLimit("custom-game", 20, 60 * 60_000),
    validate(
      "json",
      z.object({
        name: z.string().trim().min(1).max(200),
        releaseDate: z.iso.date().nullable().optional(),
        coverUrl: z
          .url({ protocol: /^https$/ })
          .nullable()
          .optional(),
      }),
    ),
    async (c) => {
      const game = await createCustomGame(currentUser(c).id, c.req.valid("json"));
      return c.json({ game: { id: game.id, slug: game.slug, name: game.name } }, 201);
    },
  )
  .get("/games/:slug", async (c) => c.json(await getGameBySlug(c.req.param("slug"))))
  .get("/games/:slug/screenshots", async (c) => {
    const { game } = await getGameBySlug(c.req.param("slug"));
    return c.json({ screenshots: await listScreenshots({ gameId: game.id }) });
  });
