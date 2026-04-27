import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ok } from "../lib/response";
import gameService from "../services/game.service";
import {
  addGameSchema,
  editGameSchema,
  getUserGamesQuerySchema,
} from "../schemas/game.schema";
import {
  authMiddleware,
  gameOwnerMiddleware,
} from "../middlewares/auth.middleware";
import type { AppVariables } from "../types/context";

const games = new Hono<{ Variables: AppVariables }>();

games.post(
  "/add",
  authMiddleware,
  zValidator("json", addGameSchema),
  async (c) => {
    const userId = c.get("userId");
    const data = c.req.valid("json");
    const game = await gameService.addNewGameService(data, userId);
    return c.json(ok(game), 201);
  },
);

games.get(
  "/user/:id",
  zValidator("query", getUserGamesQuerySchema),
  async (c) => {
    const id = c.req.param("id");
    const { sortBy, order, search, status, platform, page, limit } =
      c.req.valid("query");
    const games = await gameService.getUserGamesService({
      id,
      sortBy,
      order,
      search,
      status,
      platform,
      page,
      limit,
    });
    return c.json(ok(games));
  },
);

games.get("/game/:game_id", async (c) => {
  const game = await gameService.getGameDetailService(c.req.param("game_id"));
  return c.json(ok(game));
});

games.delete("/delete/:id", authMiddleware, gameOwnerMiddleware, async (c) => {
  const userId = c.get("userId");
  await gameService.deleteGameService(c.req.param("id"), userId);
  return c.json(ok({ message: "Game deleted" }));
});

games.put(
  "/edit/:id",
  authMiddleware,
  gameOwnerMiddleware,
  zValidator("json", editGameSchema),
  async (c) => {
    const userId = c.get("userId");
    const game = await gameService.editGameService(
      c.req.valid("json"),
      c.req.param("id"),
      userId,
    );
    return c.json(ok(game));
  },
);

export default games;
