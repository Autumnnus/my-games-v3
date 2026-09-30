import { deleteThread, getThread, listThreads, streamChat } from "@my-games/core/ai/chat";
import { pageContextSchema } from "@my-games/core/ai/context";
import { pickGames, pickInputSchema } from "@my-games/core/ai/pick";
import { entryRecap } from "@my-games/core/ai/recap";
import { draftReview, reviewDraftSchema } from "@my-games/core/ai/review";
import { assistantSuggestions, mentionCandidates } from "@my-games/core/ai/suggestions";
import { usageToday } from "@my-games/core/ai/usage";
import type { UIMessage } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { localeFromRequest } from "../locale";
import { type AppEnv, currentUser, rateLimit, requireUser, withSession } from "../middleware";
import { uuidParam, validate } from "../validation";

const chatBody = z.object({
  id: z.uuid(),
  // İçerik core'da ayrıntılı doğrulanır: kullanıcı mesajında rol/uzunluk/parça türleri; onay turunda
  // yalnızca kararlar alınır, geri kalanı sunucudaki kayıttan gelir.
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.enum(["user", "assistant"]),
    parts: z
      .array(z.object({ type: z.string() }).passthrough())
      .min(1)
      .max(60),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

/** `?type=game&slug=…` biçimindeki sayfa bağlamı (GET istekleri için). */
const pageQuery = z.object({
  type: z.enum(["game", "entry", "profile", "stats", "inbox", "home"]).optional(),
  slug: z.string().max(200).optional(),
  id: z.string().max(100).optional(),
  username: z.string().max(40).optional(),
});

function localeOf(c: { req: { raw: Request } }, user: { locale?: string | null }) {
  return user.locale === "tr" || user.locale === "en" ? user.locale : localeFromRequest(c.req.raw);
}

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
        locale: localeOf(c, user),
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
  )
  .get("/ai/suggestions", withSession, requireUser, validate("query", pageQuery), async (c) => {
    const page = pageContextSchema.safeParse(c.req.valid("query"));
    return c.json(
      await assistantSuggestions(currentUser(c).id, page.success ? page.data : undefined),
    );
  })
  .get(
    "/ai/mentions",
    withSession,
    requireUser,
    rateLimit("ai-mentions", 120, 60_000),
    validate("query", z.object({ q: z.string().max(100).optional() })),
    async (c) => c.json(await mentionCandidates(currentUser(c).id, c.req.valid("query").q ?? "")),
  )
  .post(
    "/ai/pick",
    withSession,
    requireUser,
    rateLimit("ai-pick", 10, 60_000),
    validate("json", pickInputSchema),
    async (c) => {
      const user = currentUser(c);
      return c.json(await pickGames(user.id, c.req.valid("json"), localeOf(c, user)));
    },
  )
  .post(
    "/ai/review-draft",
    withSession,
    requireUser,
    rateLimit("ai-review", 10, 60_000),
    validate("json", reviewDraftSchema),
    async (c) => {
      const user = currentUser(c);
      return c.json(await draftReview(user.id, c.req.valid("json"), localeOf(c, user)));
    },
  )
  .get(
    "/ai/recap/:id",
    withSession,
    requireUser,
    rateLimit("ai-recap", 30, 60_000),
    validate("param", uuidParam),
    async (c) => {
      const user = currentUser(c);
      return c.json(await entryRecap(user.id, c.req.valid("param").id, localeOf(c, user)));
    },
  );
