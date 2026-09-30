import {
  answerPlayHistory,
  entryPlayHistory,
  estimateQuestions,
  resetEntryPlayHistory,
  setEntryPlayHistory,
} from "@my-games/core/estimates/entry";
import { MAX_USER_PERIODS } from "@my-games/core/estimates/planner";
import { estimateIntensities } from "@my-games/shared";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, currentUser, requireUser, withSession } from "../middleware";
import { uuidParam, validate } from "../validation";

const periodsSchema = z
  .object({
    excluded: z.boolean().default(false),
    periods: z
      .array(
        z.object({
          from: z.iso.date(),
          to: z.iso.date(),
          intensity: z.enum(estimateIntensities),
        }),
      )
      .max(MAX_USER_PERIODS)
      .default([]),
  })
  .refine((value) => value.excluded || value.periods.length > 0, {
    message: "En az bir dönem gerekli",
    path: ["periods"],
  });

const answerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("once"),
    year: z.number().int().min(1995).max(2100),
    month: z.number().int().min(1).max(12).nullable().optional(),
  }),
  z.object({
    kind: z.literal("years"),
    years: z.array(z.number().int().min(1995).max(2100)).min(1).max(40),
  }),
  z.object({ kind: z.literal("tool") }),
  z.object({ kind: z.literal("confirm") }),
]);

/**
 * Kaydın oynama geçmişi (gerçek oturumlar + takipten önceki tahmin). Okuma herkese açık; "ne zaman
 * oynadım" düzeltmesi ve tahmine dönüş yalnızca kaydın sahibine.
 */
export const estimateRoutes = new Hono<AppEnv>()
  // "Geçmişini netleştir" destesi: sorulmaya değer oyunlar (yalnızca kendi kütüphanen).
  .get("/me/play-history/questions", withSession, requireUser, async (c) =>
    c.json(await estimateQuestions(currentUser(c).id)),
  )
  .post(
    "/library/:id/play-history/answer",
    withSession,
    requireUser,
    validate("param", uuidParam),
    validate("json", answerSchema),
    async (c) =>
      c.json(
        await answerPlayHistory(currentUser(c).id, c.req.valid("param").id, c.req.valid("json")),
      ),
  )
  .get("/library/:id/play-history", validate("param", uuidParam), async (c) =>
    c.json(await entryPlayHistory(c.req.valid("param").id)),
  )
  .put(
    "/library/:id/play-history",
    withSession,
    requireUser,
    validate("param", uuidParam),
    validate("json", periodsSchema),
    async (c) =>
      c.json(
        await setEntryPlayHistory(currentUser(c).id, c.req.valid("param").id, c.req.valid("json")),
      ),
  )
  .delete(
    "/library/:id/play-history",
    withSession,
    requireUser,
    validate("param", uuidParam),
    async (c) => c.json(await resetEntryPlayHistory(currentUser(c).id, c.req.valid("param").id)),
  );
