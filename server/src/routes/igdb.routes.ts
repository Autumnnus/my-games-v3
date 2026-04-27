import { Hono } from "hono";
import { ok } from "../lib/response";
import igdbService from "../services/igdb.service";
import {
  authMiddleware,
  adminMiddleware,
} from "../middlewares/auth.middleware";
import type { AppVariables } from "../types/context";

const igdb = new Hono<{ Variables: AppVariables }>();

igdb.get("/", authMiddleware, async (c) => {
  const search = c.req.query("search") ?? "";
  const data = await igdbService.getIGDBGamesService(search);
  return c.json(ok(data));
});

igdb.get("/:gameId", authMiddleware, async (c) => {
  const data = await igdbService.getIGDBGameService(
    Number(c.req.param("gameId")),
  );
  return c.json(ok(data));
});

igdb.put("/", authMiddleware, adminMiddleware, async (c) => {
  const { mongoId } = await c.req.json<{ mongoId: string }>();
  const data = await igdbService.updateGameIGDBDataService(mongoId);
  return c.json(ok(data));
});

igdb.put("/all", authMiddleware, adminMiddleware, async (c) => {
  const data = await igdbService.updateAllGamesIGDBDataService();
  return c.json(ok(data));
});

export default igdb;
