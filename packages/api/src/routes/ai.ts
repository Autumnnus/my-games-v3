import {
  deleteThread,
  getThread,
  listThreads,
  streamChat,
  usageToday,
} from "@my-games/core/ai/chat";
import type { UIMessage } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { localeFromRequest } from "../locale";
import { type AppEnv, currentUser, rateLimit, requireUser, withSession } from "../middleware";
import { uuidParam, validate } from "../validation";

const chatBody = z.object({
  id: z.uuid(),
  // Mesajın içeriği core'da ayrıntılı doğrulanır (rol, uzunluk, parça türleri).
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z
      .array(z.object({ type: z.string() }).passthrough())
      .min(1)
      .max(10),
  }),
});

export const aiRoutes = new Hono<AppEnv>()
  .post(
    "/ai/chat",
    withSession,
    requireUser,
    rateLimit("ai-chat", 20, 60_000),
    validate("json", chatBody),
    async (c) => {
      const user = currentUser(c);
      const { id, message } = c.req.valid("json");
      return streamChat({
        userId: user.id,
        threadId: id,
        message: message as unknown as UIMessage,
        locale:
          user.locale === "tr" || user.locale === "en" ? user.locale : localeFromRequest(c.req.raw),
        abortSignal: c.req.raw.signal,
      });
    },
  )
  .get("/ai/threads", withSession, requireUser, async (c) =>
    c.json({ threads: await listThreads(currentUser(c).id) }),
  )
  .get("/ai/threads/:id", withSession, requireUser, validate("param", uuidParam), async (c) =>
    c.json(await getThread(currentUser(c).id, c.req.valid("param").id)),
  )
  .delete("/ai/threads/:id", withSession, requireUser, validate("param", uuidParam), async (c) => {
    await deleteThread(currentUser(c).id, c.req.valid("param").id);
    return c.json({ ok: true });
  })
  .get("/ai/usage", withSession, requireUser, async (c) =>
    c.json(await usageToday(currentUser(c).id)),
  );
