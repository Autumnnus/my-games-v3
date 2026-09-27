import { randomUUID } from "node:crypto";
import { schema } from "@my-games/db";
import { db } from "../src/db";

export async function createUser(overrides: Partial<typeof schema.user.$inferInsert> = {}) {
  const suffix = randomUUID().slice(0, 8);
  const [row] = await db
    .insert(schema.user)
    .values({
      id: randomUUID(),
      name: `User ${suffix}`,
      email: `user-${suffix}@example.com`,
      emailVerified: true,
      username: `user_${suffix}`,
      displayUsername: `user_${suffix}`,
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("user insert failed");
  return row;
}

export async function createGame(overrides: Partial<typeof schema.games.$inferInsert> = {}) {
  const suffix = randomUUID().slice(0, 8);
  const [row] = await db
    .insert(schema.games)
    .values({ source: "custom", name: `Game ${suffix}`, slug: `game-${suffix}`, ...overrides })
    .returning();
  if (!row) throw new Error("game insert failed");
  return row;
}

/** `fetch`'i verilen URL eşleşmelerine göre sahte yanıtlarla değiştirir. */
export function mockFetch(
  routes: Array<{
    match: (url: string, init?: RequestInit) => boolean;
    respond: (url: string, init?: RequestInit) => Response | Promise<Response>;
  }>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    const route = routes.find((candidate) => candidate.match(url, init));
    if (!route) throw new Error(`Beklenmeyen fetch: ${url}`);
    return route.respond(url, init);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
