import { schema } from "@my-games/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyPool } from "../src/ai/key-pool";
import {
  addKey,
  aiEnabled,
  deleteKey,
  keyStrategy,
  listStoredKeys,
  providerKeys,
  reorderKeys,
  setKeyStrategy,
  testStoredKey,
  updateKey,
} from "../src/ai/keys";
import { aiStatus } from "../src/ai/models";
import { type KeyCheck, providerAdapter, registerProvider } from "../src/ai/providers";
import { db } from "../src/db";

// Sahte sağlayıcı: "bad" ile başlayan anahtarı reddeder, "busy" ile başlayanı kotası dolu sayar.
const checks: string[] = [];
registerProvider({
  id: "fakeai",
  defaults: { chat: "fake-chat", light: "fake-light" },
  createModel: () => {
    throw new Error("not used");
  },
  async verifyKey(key): Promise<KeyCheck> {
    checks.push(key);
    if (key.startsWith("bad")) return { status: "invalid", message: "API key not valid" };
    if (key.startsWith("busy")) return { status: "limited", message: "quota" };
    return { status: "ok" };
  },
});

const add = (key: string, name: string | null = null) =>
  addKey({ provider: "fakeai", key, name, actorId: null });

afterEach(() => {
  delete process.env.FAKEAI_API_KEYS;
  vi.unstubAllGlobals();
  checks.length = 0;
});

describe("AI key store", () => {
  it("keeps keys encrypted, never lists the secret and feeds the pool in panel order", async () => {
    const first = await add("key-aaaa-1111-zzzz", "Project A");
    const second = await add("key-bbbb-2222-zzzz");
    expect(first.check.status).toBe("ok");

    const [row] = await db.select().from(schema.aiApiKeys).limit(1);
    expect(row?.secret).not.toContain("key-");
    expect(row?.fingerprint).not.toContain("key-");

    const listed = await listStoredKeys();
    expect(JSON.stringify(listed)).not.toContain("key-aaaa-1111-zzzz");
    expect(listed.map((key) => [key.name, key.hint, key.position])).toEqual([
      ["Project A", "key-…zzzz", 0],
      [null, "key-…zzzz", 1],
    ]);

    expect(await providerKeys("fakeai")).toEqual([
      { key: "key-aaaa-1111-zzzz", label: "Project A · key-…zzzz", ref: `db:${first.id}` },
      { key: "key-bbbb-2222-zzzz", label: "key-…zzzz", ref: `db:${second.id}` },
    ]);

    await reorderKeys("fakeai", [second.id, first.id]);
    expect((await providerKeys("fakeai")).map((key) => key.ref)).toEqual([
      `db:${second.id}`,
      `db:${first.id}`,
    ]);
    await expect(reorderKeys("fakeai", [first.id])).rejects.toMatchObject({
      reason: "ai_key_order",
    });
  });

  it("rejects keys the provider refuses and duplicates, but accepts a key that is only rate limited", async () => {
    await expect(add("bad-key-123456")).rejects.toMatchObject({ reason: "ai_key_invalid" });
    const busy = await add("busy-key-123456");
    expect(busy.check.status).toBe("limited");
    await expect(add("busy-key-123456")).rejects.toMatchObject({ reason: "ai_key_duplicate" });

    await expect(
      addKey({ provider: "nope", key: "whatever-123", actorId: null }),
    ).rejects.toMatchObject({ reason: "ai_key_provider" });
  });

  it("drops disabled and deleted keys from the pool and appends environment keys after panel keys", async () => {
    process.env.FAKEAI_API_KEYS = "env-key-999999,key-aaaa-1111-zzzz";
    const stored = await add("key-aaaa-1111-zzzz-panel");
    expect((await providerKeys("fakeai")).map((key) => key.label)).toEqual([
      "key-…anel",
      "env · env-…9999",
      "env · key-…zzzz",
    ]);

    await updateKey(stored.id, { enabled: false, name: "Kapalı" });
    expect((await providerKeys("fakeai")).map((key) => key.ref)).toEqual(["env:0", "env:1"]);
    expect((await listStoredKeys())[0]).toMatchObject({ name: "Kapalı", enabled: false });

    await deleteKey(stored.id);
    expect(await listStoredKeys()).toEqual([]);
    await expect(testStoredKey(stored.id)).rejects.toMatchObject({ reason: "ai_key_not_found" });
  });

  it("moves an environment key into the panel: the panel copy wins and the env row is flagged", async () => {
    process.env.FAKEAI_API_KEYS = "env-key-999999,env-key-888888";
    const moved = await add("env-key-999999", "Taşındı");
    expect((await providerKeys("fakeai")).map((key) => key.ref)).toEqual([
      `db:${moved.id}`,
      "env:1",
    ]);
    const { envKeys } = await import("../src/ai/keys");
    expect(
      (await envKeys()).filter((key) => key.provider === "fakeai").map((key) => key.inPanel),
    ).toEqual([true, false]);
    await expect(add("env-key-999999")).rejects.toMatchObject({ reason: "ai_key_duplicate" });

    // Panelde kapatılan anahtar env'den geri gelmez.
    await updateKey(moved.id, { enabled: false });
    expect((await providerKeys("fakeai")).map((key) => key.ref)).toEqual(["env:1"]);
  });

  it("re-tests a stored key with the decrypted secret", async () => {
    const stored = await add("key-cccc-3333-zzzz");
    checks.length = 0;
    expect((await testStoredKey(stored.id)).check).toEqual({ status: "ok" });
    expect(checks).toEqual(["key-cccc-3333-zzzz"]);
  });

  it("turns the assistant on with a panel key alone and shows it in the live status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 })),
    );
    expect(await aiEnabled()).toBe(false);
    const stored = await addKey({
      provider: "google",
      key: "AIzaSyTEST-panel-key-0001",
      name: "Panel",
      actorId: null,
    });
    expect(await aiEnabled()).toBe(true);
    const status = await aiStatus();
    expect(status.enabled).toBe(true);
    expect(status.pools[0]?.keys).toEqual([
      expect.objectContaining({
        ref: `db:${stored.id}`,
        label: "Panel · AIza…0001",
        state: "ready",
      }),
    ]);
  });

  it("lets the panel override the key strategy and fall back to the environment", async () => {
    process.env.AI_KEY_STRATEGY = "failover";
    try {
      expect(await keyStrategy()).toEqual({ value: "failover", source: "env" });
      expect(await setKeyStrategy("round_robin")).toEqual({
        value: "round_robin",
        source: "setting",
      });
      expect(await setKeyStrategy(null)).toEqual({ value: "failover", source: "env" });
    } finally {
      delete process.env.AI_KEY_STRATEGY;
    }
  });
});

describe("Gemini key check", () => {
  const google = () => {
    const adapter = providerAdapter("google");
    if (!adapter?.verifyKey) throw new Error("google verifyKey missing");
    return adapter.verifyKey.bind(adapter);
  };
  const reply = (status: number, body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );

  it("maps the model list response to ok, invalid and limited", async () => {
    reply(200, { models: [] });
    expect(await google()("k")).toEqual({ status: "ok" });
    reply(400, {
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key.",
        details: [{ reason: "API_KEY_INVALID" }],
      },
    });
    expect((await google()("k")).status).toBe("invalid");
    reply(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } });
    expect(await google()("k")).toEqual({ status: "limited", message: "Quota exceeded" });
    reply(500, { error: { message: "backend" } });
    expect((await google()("k")).status).toBe("error");
  });
});

describe("pool rebuild", () => {
  it("carries the cooling state of unchanged keys into the new pool", () => {
    const now = Date.parse("2026-10-04T12:00:00Z");
    const old = new KeyPool("fake", ["a-key", "b-key"], { now: () => now });
    old.fail(0, "m", { kind: "rate_limit", retryAfterMs: 60_000 });
    old.succeed(1, "m");
    const next = new KeyPool("fake", ["c-key", "b-key", "a-key"], { now: () => now }).inherit(old);
    const [c, b, a] = next.snapshot();
    expect(c).toMatchObject({ state: "ready", ok: 0 });
    expect(b).toMatchObject({ state: "ready", ok: 1 });
    expect(a).toMatchObject({ state: "cooling", failed: 1 });
  });
});
