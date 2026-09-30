import { AppError } from "@my-games/core/errors";
import { errorInfo, errorMessageOf, logger } from "@my-games/core/log";
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
  // Better Auth'un admin uç noktaları (rol verme, başkasının yerine geçme, şifre değiştirme…) dışarı kapalı:
  // yönetim işlemleri yalnızca rolü veritabanından doğrulayan ve denetim kaydı tutan `/v1/admin`'den yapılır.
  .all("/auth/admin/*", (c) => c.json({ error: "not_found" }, 404))
  // Hesap silme kullanıcıya kapalı (auth.ts `deleteUser`); uç nokta hiç görünmesin.
  .all("/auth/delete-user/*", (c) => c.json({ error: "not_found" }, 404))
  .all("/auth/delete-user", (c) => c.json({ error: "not_found" }, 404))
  .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
  // Form/text gövdeli (preflight'sız) istekler yalnızca kendi origin'imizden kabul edilir. JSON istekleri
  // zaten CORS preflight'ına takılır; Better Auth kendi origin kontrolünü yapar.
  .use("/v1/*", csrf({ origin: new URL(env.APP_URL).origin }))
  .route("/v1", v1)
  .notFound((c) => c.json({ error: "not_found" }, 404))
  .onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        { error: error.code, reason: error.reason, message: error.message },
        error.status as 400,
      );
    }
    if (error instanceof HTTPException) return error.getResponse();
    const user = c.get("user" as never) as { id?: string } | undefined;
    logger.error(
      "api",
      "request_failed",
      `${c.req.method} ${c.req.path}: ${errorMessageOf(error)}`,
      {
        userId: user?.id ?? null,
        context: { method: c.req.method, path: c.req.path, error: errorInfo(error) },
      },
    );
    return c.json({ error: "internal_error" }, 500);
  });

// Geliştirmede Vite modülü sıcak yeniden yükler; başlangıç kaydı süreç başına bir kez düşer.
const started = globalThis as { __myGamesApiStarted?: boolean };
if (!started.__myGamesApiStarted) {
  started.__myGamesApiStarted = true;
  logger.info("api", "started", `app hazır (${process.version}, pid ${process.pid})`);
}

export type AppType = typeof app;
export type { AssistantMessageMetadata, AssistantUIMessage } from "@my-games/core/ai/chat";
export type {
  AssistantCommand,
  AssistantMode,
  Mention,
  PageContext,
} from "@my-games/core/ai/context";
export type { ReviewDraftInput } from "@my-games/core/ai/review";
export type { Suggestion } from "@my-games/core/ai/suggestions";
export type { ApprovalPreview } from "@my-games/core/ai/tools";
export type { SessionUser } from "./auth";
export { syncLocale } from "./locale-sync";
export type { AdminAppType } from "./routes/admin";
