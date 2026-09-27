import { AppError } from "@my-games/core/errors";
import { compareUsers, globalStats, userStats, wrapped, wrappedYears } from "@my-games/core/stats";
import { findUserByUsername } from "@my-games/core/users";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, rateLimit } from "../middleware";
import { validate } from "../validation";

async function userIdOf(username: string) {
  const found = await findUserByUsername(username);
  if (!found) throw new AppError("not_found", "Kullanıcı bulunamadı");
  return found;
}

/** Herkese açık ama ağır toplamlar: IP/kullanıcı başına dakikada sınırlı. */
const statsLimit = rateLimit("stats", 60, 60_000);

// Topluluk istatistikleri herkes için aynı; birkaç dakikalık önbellek yeterli.
const GLOBAL_TTL_MS = 5 * 60_000;
let globalCache: { at: number; value: Awaited<ReturnType<typeof globalStats>> } | null = null;

export const statsRoutes = new Hono<AppEnv>()
  .use("/users/:username/stats", statsLimit)
  .use("/users/:username/wrapped/*", statsLimit)
  .use("/stats/*", statsLimit)
  .get("/users/:username/stats", async (c) => {
    const owner = await userIdOf(c.req.param("username"));
    return c.json(await userStats(owner.id));
  })
  .get("/users/:username/wrapped", async (c) => {
    const owner = await userIdOf(c.req.param("username"));
    return c.json({ years: await wrappedYears(owner.id) });
  })
  .get(
    "/users/:username/wrapped/:year",
    validate(
      "param",
      z.object({ username: z.string(), year: z.coerce.number().int().min(1990).max(2100) }),
    ),
    async (c) => {
      const { username, year } = c.req.valid("param");
      const owner = await userIdOf(username);
      return c.json(await wrapped(owner.id, year));
    },
  )
  .get("/stats/global", async (c) => {
    if (!globalCache || Date.now() - globalCache.at > GLOBAL_TTL_MS) {
      globalCache = { at: Date.now(), value: await globalStats() };
    }
    return c.json(globalCache.value);
  })
  .get(
    "/stats/compare",
    validate("query", z.object({ a: z.string().min(1).max(40), b: z.string().min(1).max(40) })),
    async (c) => {
      const { a, b } = c.req.valid("query");
      const [first, second] = await Promise.all([userIdOf(a), userIdOf(b)]);
      const users = [first, second].map((user) => ({
        id: user.id,
        name: user.name,
        username: user.displayUsername ?? user.username,
        image: user.image,
      }));
      return c.json({ users, ...(await compareUsers(first.id, second.id)) });
    },
  );
