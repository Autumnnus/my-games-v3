import { Hono } from "hono";
import type { AppVariables } from "../types/context";
import authRoutes from "./auth.routes";
import gamesRoutes from "./games.routes";
import usersRoutes from "./users.routes";
import screenshotRoutes from "./screenshot.routes";
import igdbRoutes from "./igdb.routes";
import statisticsRoutes from "./statistics.routes";
import steamRoutes from "./steam.routes";
import activityRoutes from "./activity.routes";
import steamSyncRoutes from "./steam-sync.routes";
import notificationRoutes from "./notification.routes";
import importRoutes from "./import.routes";
import exportRoutes from "./export.routes";

const api = new Hono<{ Variables: AppVariables }>();

api.route("/auth", authRoutes);
api.route("/games", gamesRoutes);
api.route("/users", usersRoutes);
api.route("/screenshot", screenshotRoutes);
api.route("/igdb", igdbRoutes);
api.route("/statistics", statisticsRoutes);
api.route("/steam", steamRoutes);
api.route("/activity", activityRoutes);
api.route("/steam-sync", steamSyncRoutes);
api.route("/notifications", notificationRoutes);
api.route("/import", importRoutes);
api.route("/export", exportRoutes);

export default api;
