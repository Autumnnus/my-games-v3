import { apiReference } from "@scalar/hono-api-reference";
import { CronJob } from "cron";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { connectDatabase } from "./config/db";
import { env } from "./config/env";
import { buildOpenApiSpec } from "./docs/openapi";
import { AppError } from "./lib/errors";
import { fail } from "./lib/response";
import api from "./routes/index";
import statisticsService from "./services/statistics.service";
import { startSteamSyncCron } from "./services/steam-sync.service";
import type { AppVariables } from "./types/context";

const app = new Hono<{ Variables: AppVariables }>();
const port = env.PORT;
const baseUrl = `http://localhost:${port}`;
const safeMongoUrl = env.MONGO_URL.replace(/\/\/([^@/]+)@/, "//***:***@");

const allowedOrigins = [
  env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:4173",
  "https://my-games-v3-client-proje.autumnnus.dev",
].filter((v, i, a) => a.indexOf(v) === i);

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin || allowedOrigins.includes(origin)) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.get("/openapi.json", (c) => c.json(buildOpenApiSpec(baseUrl)));
app.get(
  "/scalar",
  apiReference({
    url: "/openapi.json",
    theme: "deepSpace",
  }),
);

app.route("/api", api);

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      fail(err.code, err.message, err.details),
      err.status as Parameters<typeof c.json>[1],
    );
  }
  console.error(err);
  return c.json(fail("INTERNAL_ERROR", "Something went wrong"), 500);
});

app.notFound((c) => c.json(fail("NOT_FOUND", "Route not found"), 404));

const dailyStatsJob = new CronJob(
  "0 0 * * *",
  async () => {
    console.log("Running daily statistics update...");
    try {
      await statisticsService.updateStatisticsService();
      console.log("Daily statistics update complete");
    } catch (err) {
      console.error("Daily statistics update failed:", err);
    }
  },
  null,
  false,
  "Europe/Istanbul",
);

connectDatabase().then(() => {
  dailyStatsJob.start();
  startSteamSyncCron();
  Bun.serve({ fetch: app.fetch, port });

  console.log("----------------------------------------");
  console.log(`Environment   : ${env.NODE_ENV}`);
  console.log(`Port (.env)   : ${port}`);
  console.log(`API Base URL  : ${baseUrl}`);
  console.log(`Scalar Docs   : ${baseUrl}/scalar`);
  console.log(`OpenAPI JSON  : ${baseUrl}/openapi.json`);
  console.log(`CORS Origins  : ${allowedOrigins.join(", ")}`);
  console.log(`Steam Realm   : ${env.STEAM_REALM}`);
  console.log(`Mongo URL     : ${safeMongoUrl}`);
  console.log("----------------------------------------");
});
