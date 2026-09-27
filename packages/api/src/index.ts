import { AppError } from "@my-games/core/errors";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth";
import { env } from "./env";
import { v1 } from "./routes/v1";

export const app = new Hono()
  .basePath("/api")
  .use(secureHeaders())
  .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
  // Form/text gövdeli (preflight'sız) istekler yalnızca kendi origin'imizden kabul edilir. JSON istekleri
  // zaten CORS preflight'ına takılır; Better Auth kendi origin kontrolünü yapar.
  .use("/v1/*", csrf({ origin: new URL(env.APP_URL).origin }))
  .route("/v1", v1)
  .notFound((c) => c.json({ error: "not_found" }, 404))
  .onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: error.code, message: error.message }, error.status as 400);
    }
    if (error instanceof HTTPException) return error.getResponse();
    console.error("[api]", c.req.method, c.req.path, error);
    return c.json({ error: "internal_error" }, 500);
  });

export type AppType = typeof app;
export type { SessionUser } from "./auth";
