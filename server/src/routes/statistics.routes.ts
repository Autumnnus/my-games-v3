import { Hono } from "hono";
import { ok } from "../lib/response";
import statisticsService from "../services/statistics.service";
import {
  authMiddleware,
  adminMiddleware,
} from "../middlewares/auth.middleware";
import type { AppVariables } from "../types/context";

const statistics = new Hono<{ Variables: AppVariables }>();

statistics.get("/", async (c) => {
  const data = await statisticsService.getStatisticsService();
  return c.json(ok(data));
});

statistics.get("/user/:userId", async (c) => {
  const data = await statisticsService.getUserAggregateStatisticsService(
    c.req.param("userId"),
  );
  return c.json(ok(data));
});

statistics.get("/:id", async (c) => {
  const data = await statisticsService.getUserStatisticsService(
    c.req.param("id"),
  );
  return c.json(ok(data));
});

statistics.put("/", authMiddleware, adminMiddleware, async (c) => {
  const data = await statisticsService.updateStatisticsService();
  return c.json(ok(data));
});

export default statistics;
