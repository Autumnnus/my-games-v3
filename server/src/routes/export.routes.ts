import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middlewares/auth.middleware";
import { exportGames } from "../services/import-export.service";
import type { AppVariables } from "../types/context";

const exportRoutes = new Hono<{ Variables: AppVariables }>();

// GET /api/export/:format
// Export all library entries as xlsx or json
exportRoutes.get("/:format", authMiddleware, async (c) => {
  const userId = c.get("userId");
  if (!userId) throw new AppError("UNAUTHORIZED", "Not authenticated", 401);

  const format = c.req.param("format");
  if (format !== "xlsx" && format !== "json") {
    throw new AppError(
      "EXPORT_INVALID_FORMAT",
      "Format must be xlsx or json",
      400,
    );
  }

  const status = c.req.query("status") ?? undefined;
  const platform = c.req.query("platform") ?? undefined;
  const includeScreenshots = c.req.query("includeScreenshots") !== "false";

  const result = await exportGames({
    userId,
    format: format as "xlsx" | "json",
    status,
    platform,
    includeScreenshots,
  });

  c.header("Content-Type", result.contentType);
  c.header("Content-Disposition", `attachment; filename="${result.filename}"`);

  if (typeof result.data === "string") {
    return c.body(result.data);
  }

  // result.data is Buffer; return as Uint8Array (Hono accepts ArrayBufferView)
  const buf = result.data;
  return c.body(new Uint8Array(buf));
});

export default exportRoutes;
