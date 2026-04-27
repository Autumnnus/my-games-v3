import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ok } from "../lib/response";
import activityService from "../services/activity.service";
import type { AppVariables } from "../types/context";

const activity = new Hono<{ Variables: AppVariables }>();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

activity.get("/feed", zValidator("query", paginationSchema), async (c) => {
  const { page, limit } = c.req.valid("query");
  const feed = await activityService.getFeed(page, limit);
  return c.json(ok(feed));
});

activity.get("/user/:id", zValidator("query", paginationSchema), async (c) => {
  const userId = c.req.param("id");
  const { page, limit } = c.req.valid("query");
  const feed = await activityService.getUserFeed(userId, page, limit);
  return c.json(ok(feed));
});

export default activity;
