import {
  getRules,
  listIgnores,
  listProposals,
  pendingCount,
  removeIgnore,
  resolveMany,
  resolveProposal,
  setRule,
} from "@my-games/core/proposals";
import { proposalSources, syncActions } from "@my-games/shared";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, currentUser, requireUser, withSession } from "../middleware";
import { uuidParam, validate } from "../validation";

export const inboxRoutes = new Hono<AppEnv>()
  .get(
    "/proposals",
    withSession,
    requireUser,
    validate("query", z.object({ status: z.enum(["pending", "resolved"]).optional() })),
    async (c) =>
      c.json({
        proposals: await listProposals(currentUser(c).id, c.req.valid("query").status ?? "pending"),
      }),
  )
  .get("/proposals/count", withSession, requireUser, async (c) =>
    c.json({ count: await pendingCount(currentUser(c).id) }),
  )
  .post(
    "/proposals/:id/:action{approve|reject}",
    withSession,
    requireUser,
    validate("param", uuidParam.extend({ action: z.enum(["approve", "reject"]) })),
    validate(
      "json",
      z
        .object({ choice: z.string().max(40).optional(), ignore: z.boolean().optional() })
        .optional(),
    ),
    async (c) => {
      const { id, action } = c.req.valid("param");
      await resolveProposal(currentUser(c).id, id, action, c.req.valid("json") ?? {});
      return c.json({ ok: true });
    },
  )
  .post(
    "/proposals/bulk",
    withSession,
    requireUser,
    validate(
      "json",
      z.object({ ids: z.array(z.uuid()).min(1).max(200), action: z.enum(["approve", "reject"]) }),
    ),
    async (c) => {
      const { ids, action } = c.req.valid("json");
      return c.json({ results: await resolveMany(currentUser(c).id, ids, action) });
    },
  )
  .get("/sync/rules", withSession, requireUser, async (c) =>
    c.json({ rules: await getRules(currentUser(c).id) }),
  )
  .put(
    "/sync/rules",
    withSession,
    requireUser,
    validate(
      "json",
      z.object({
        source: z.enum(proposalSources),
        kind: z.string().max(40),
        action: z.enum(syncActions),
      }),
    ),
    async (c) => {
      const { source, kind, action } = c.req.valid("json");
      await setRule(currentUser(c).id, source, kind, action);
      return c.json({ rules: await getRules(currentUser(c).id) });
    },
  )
  .get("/sync/ignores", withSession, requireUser, async (c) =>
    c.json({ ignores: await listIgnores(currentUser(c).id) }),
  )
  .delete(
    "/sync/ignores",
    withSession,
    requireUser,
    validate(
      "json",
      z.object({ source: z.enum(proposalSources), externalId: z.string().max(100) }),
    ),
    async (c) => {
      const { source, externalId } = c.req.valid("json");
      await removeIgnore(currentUser(c).id, source, externalId);
      return c.json({ ok: true });
    },
  );
