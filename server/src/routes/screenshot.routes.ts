import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ok } from "../lib/response";
import { AppError } from "../lib/errors";
import screenshotService from "../services/screenshot.service";
import {
  addTextScreenshotSchema,
  addExternalScreenshotSchema,
  bulkDeleteScreenshotSchema,
  editTextScreenshotSchema,
  getScreenshotsQuerySchema,
  type AddTextScreenshotInput,
  type AddExternalScreenshotInput,
} from "../schemas/screenshot.schema";
import {
  authMiddleware,
  gameOwnerMiddleware,
  screenshotOwnerMiddleware,
  adminMiddleware,
} from "../middlewares/auth.middleware";
import type { AppVariables } from "../types/context";

const screenshot = new Hono<{ Variables: AppVariables }>();

type AppContext = Context<{ Variables: AppVariables }>;

function requireParam(
  c: AppContext,
  key: "game_id" | "screenshot_id" | "user_id",
): string {
  const value = c.req.param(key);
  if (!value) throw new AppError("BAD_REQUEST", `${key} is required`, 400);
  return value;
}

async function parseBulkCreatePayload(c: AppContext) {
  const userId = c.get("userId");
  const gameId = requireParam(c, "game_id");
  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const body = await c.req.parseBody({ all: true });
    const rawFiles = body["files"];
    const fileArray = Array.isArray(rawFiles)
      ? rawFiles
      : rawFiles
        ? [rawFiles]
        : [];
    const files = fileArray.filter((f): f is File => f instanceof File);
    if (!files.length)
      throw new AppError("BAD_REQUEST", "No files provided", 400);

    const named = files.map((file, i) => ({
      name: body[`name_${i}`] as string | undefined,
      file,
    }));
    return await screenshotService.addScreenshotService({
      userId,
      gameId,
      type: "image",
      files: named,
    });
  }

  const body = await c.req.json<
    AddTextScreenshotInput | AddExternalScreenshotInput
  >();

  if ((body as { type?: string }).type === "external") {
    const parsed = addExternalScreenshotSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid payload",
        400,
        parsed.error.flatten(),
      );
    return await screenshotService.addScreenshotService({
      userId,
      gameId,
      type: "external",
      payload: parsed.data.payload,
    });
  }

  const parsed = addTextScreenshotSchema.safeParse(body);
  if (!parsed.success)
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid payload",
      400,
      parsed.error.flatten(),
    );
  return await screenshotService.addScreenshotService({
    userId,
    gameId,
    type: "text",
    payload: parsed.data.payload,
  });
}

screenshot.get(
  "/:game_id",
  zValidator("query", getScreenshotsQuerySchema),
  async (c) => {
    const { page, limit, sortBy, order } = c.req.valid("query");
    const data = await screenshotService.getScreenshotService({
      gameId: requireParam(c, "game_id"),
      page,
      limit,
      sortBy,
      order,
    });
    return c.json(ok(data));
  },
);

screenshot.get("/user/:user_id", authMiddleware, async (c) => {
  const userId = requireParam(c, "user_id");
  const data = await screenshotService.getUserScreenshotsService(userId);
  return c.json(ok(data));
});

screenshot.get("/get/random/:count", async (c) => {
  const count = Number(c.req.param("count"));
  if (isNaN(count) || count < 1)
    throw new AppError("BAD_REQUEST", "Invalid count", 400);
  const data = await screenshotService.getRandomScreenshotsService(count);
  return c.json(ok(data));
});

screenshot.post(
  "/add/:game_id",
  authMiddleware,
  gameOwnerMiddleware,
  async (c) => {
    const data = await parseBulkCreatePayload(c);
    return c.json(ok(data), 201);
  },
);

screenshot.delete(
  "/delete/:game_id",
  authMiddleware,
  gameOwnerMiddleware,
  zValidator("json", bulkDeleteScreenshotSchema),
  async (c) => {
    const { screenshotIds } = c.req.valid("json");
    const result = await screenshotService.bulkDeleteScreenshotService({
      userId: c.get("userId"),
      gameId: requireParam(c, "game_id"),
      screenshotIds,
    });
    return c.json(ok(result));
  },
);

screenshot.put(
  "/edit/:game_id/:screenshot_id",
  authMiddleware,
  screenshotOwnerMiddleware,
  async (c) => {
    const userId = c.get("userId");
    const gameId = requireParam(c, "game_id");
    const screenshotId = requireParam(c, "screenshot_id");
    const contentType = c.req.header("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const body = await c.req.parseBody();
      const file = body["file"] instanceof File ? body["file"] : undefined;
      const name = body["name"] as string | undefined;
      const data = await screenshotService.editScreenshotService({
        userId,
        gameId,
        screenshotId,
        type: "image",
        name,
        file,
      });
      return c.json(ok(data));
    }

    const parsed = editTextScreenshotSchema.safeParse(await c.req.json());
    if (!parsed.success)
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid payload",
        400,
        parsed.error.flatten(),
      );
    const data = await screenshotService.editScreenshotService({
      userId,
      gameId,
      screenshotId,
      type: "text",
      ...parsed.data,
    });
    return c.json(ok(data));
  },
);

screenshot.delete(
  "/delete-all/:game_id",
  authMiddleware,
  adminMiddleware,
  async (c) => {
    const userId = c.get("userId");
    const gameId = requireParam(c, "game_id");
    const result = await screenshotService.deleteAllScreenshotsForGameService({
      userId,
      gameId,
    });
    return c.json(ok(result));
  },
);

export default screenshot;
