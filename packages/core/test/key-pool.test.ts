import { APICallError } from "@ai-sdk/provider";
import { generateText, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { KeyPool, nextQuotaReset } from "../src/ai/key-pool";
import { AiUnavailableError, createPooledModel, type PoolTarget } from "../src/ai/pooled-model";
import { classifyError, type ProviderAdapter, providerAdapter } from "../src/ai/providers";
import { traceSteps } from "../src/ai/usage";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

function apiError(statusCode: number, body?: unknown, headers?: Record<string, string>) {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: "https://example.test",
    requestBodyValues: {},
    statusCode,
    responseHeaders: headers,
    responseBody: body === undefined ? undefined : JSON.stringify(body),
    isRetryable: statusCode === 429 || statusCode >= 500,
  });
}

/** Anahtara göre davranan sahte sağlayıcı: `fail` haritasındaki anahtar o hatayı fırlatır. */
function fakeAdapter(fail: Record<string, () => unknown>, calls: string[]): ProviderAdapter {
  return {
    id: "fake",
    defaults: { chat: "m1", light: "m1" },
    createModel: (key, modelId) =>
      new MockLanguageModelV4({
        modelId,
        doGenerate: async () => {
          calls.push(`${key}:${modelId}`);
          const failure = fail[`${key}:${modelId}`] ?? fail[key];
          if (failure) throw failure();
          return {
            content: [{ type: "text", text: `ok from ${key}/${modelId}` }],
            finishReason: { unified: "stop", raw: undefined },
            usage,
            warnings: [],
          };
        },
        doStream: async () => {
          calls.push(`${key}:${modelId}`);
          const failure = fail[`${key}:${modelId}`] ?? fail[key];
          if (failure) {
            // Başarılı HTTP, ama akışın ilk parçası hata (bazı sağlayıcılar kotayı böyle bildirir).
            return {
              stream: simulateReadableStream({
                chunks: [
                  { type: "stream-start", warnings: [] },
                  { type: "error", error: failure() },
                ],
              }),
            };
          }
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: "text-start", id: "t" },
                { type: "text-delta", id: "t", delta: `stream from ${key}` },
                { type: "text-end", id: "t" },
                { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
              ],
            }),
          };
        },
      }),
  };
}

function target(adapter: ProviderAdapter, pool: KeyPool, modelId = "m1"): PoolTarget {
  return { adapter, pool, modelId };
}

describe("KeyPool", () => {
  it("spreads requests round-robin and skips a cooling key", () => {
    let now = 1_000_000;
    const pool = new KeyPool("fake", ["a", "b", "c"], { now: () => now });
    expect([pool.acquire("m")?.key, pool.acquire("m")?.key, pool.acquire("m")?.key]).toEqual([
      "a",
      "b",
      "c",
    ]);
    pool.fail(0, "m", { kind: "rate_limit", retryAfterMs: 30_000 });
    expect([pool.acquire("m")?.key, pool.acquire("m")?.key, pool.acquire("m")?.key]).toEqual([
      "b",
      "c",
      "b",
    ]);
    // Bekleme model başına: aynı anahtar başka bir modelde hâlâ kullanılabilir.
    expect(pool.acquire("other")?.key).toBe("c");
    now += 31_000;
    expect(pool.acquire("m")?.key).toBe("a");
  });

  it("uses keys in priority order with the failover strategy", () => {
    const pool = new KeyPool("fake", ["a", "b"], { strategy: "failover" });
    expect([pool.acquire("m")?.key, pool.acquire("m")?.key]).toEqual(["a", "a"]);
    pool.fail(0, "m", { kind: "rate_limit" });
    expect(pool.acquire("m")?.key).toBe("b");
  });

  it("rests a key until the next quota day on daily exhaustion and disables invalid keys", () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    const pool = new KeyPool("fake", ["abcd1234efgh5678", "b"], { now: () => now });
    const wait = pool.fail(0, "m", { kind: "rate_limit", daily: true });
    expect(now + wait).toBe(nextQuotaReset(now));
    expect(wait).toBeGreaterThan(60 * 60 * 1000);
    pool.fail(1, "m", { kind: "auth", message: "API key not valid" });
    const [first, second] = pool.snapshot();
    expect(first).toMatchObject({ label: "#1 abcd…5678", state: "cooling" });
    expect(second).toMatchObject({ state: "disabled", lastError: "API key not valid" });
    expect(pool.acquire("m")).toBeNull();
    // En erken: 6 saat devre dışı kalan anahtar (günlük kotanın sıfırlanması daha geç).
    expect(pool.nextAvailableAt("m")).toBe(now + 6 * 60 * 60 * 1000);
  });
});

describe("Google error classification", () => {
  const google = providerAdapter("google");
  if (!google) throw new Error("google adapter missing");

  it("reads RetryInfo and daily quota ids from Gemini errors", () => {
    const verdict = classifyError(
      google,
      apiError(429, {
        error: {
          code: 429,
          status: "RESOURCE_EXHAUSTED",
          message: "Quota exceeded",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
            },
            { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "41s" },
          ],
        },
      }),
    );
    expect(verdict).toMatchObject({ kind: "rate_limit", daily: true, retryAfterMs: 41_000 });
  });

  it("treats an invalid key as an auth failure and other 4xx as fatal", () => {
    expect(
      classifyError(
        google,
        apiError(400, {
          error: {
            status: "INVALID_ARGUMENT",
            message: "API key not valid. Please pass a valid API key.",
            details: [
              { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" },
            ],
          },
        }),
      ).kind,
    ).toBe("auth");
    expect(classifyError(google, apiError(400, { error: { message: "bad schema" } })).kind).toBe(
      "fatal",
    );
    expect(classifyError(google, apiError(503)).kind).toBe("server");
    expect(classifyError(google, apiError(429, undefined, { "retry-after": "12" }))).toMatchObject({
      kind: "rate_limit",
      retryAfterMs: 12_000,
    });
  });
});

describe("pooled model", () => {
  it("fails over to the next key on a rate limit and remembers it", async () => {
    const calls: string[] = [];
    const adapter = fakeAdapter({ a: () => apiError(429) }, calls);
    const pool = new KeyPool("fake", ["a", "b"]);
    const model = createPooledModel([target(adapter, pool)]);

    const first = await generateText({ model, prompt: "hi", maxRetries: 0 });
    expect(first.text).toBe("ok from b/m1");
    const second = await generateText({ model, prompt: "hi", maxRetries: 0 });
    expect(second.text).toBe("ok from b/m1");
    // "a" dinlenirken ikinci istekte hiç denenmez.
    expect(calls).toEqual(["a:m1", "b:m1", "b:m1"]);
    expect(pool.snapshot()[0]?.state).toBe("cooling");
  });

  it("tells the trace which key answered and which failed before it", async () => {
    const calls: string[] = [];
    const adapter = fakeAdapter({ a: () => apiError(429) }, calls);
    const pool = new KeyPool("fake", ["a", "b"]);
    const model = createPooledModel([target(adapter, pool)]);
    const [first, second] = pool.snapshot().map((key) => key.label);

    const generated = await generateText({ model, prompt: "hi", maxRetries: 0 });
    expect(traceSteps(generated.steps)[0]).toMatchObject({
      key: second,
      failovers: [{ model: "m1", key: first, kind: "rate_limit" }],
    });

    // Akışta da bitiş parçasına eklenir; "a" artık dinlendiği için bu kez başarısız deneme yok.
    const streamed = streamText({ model, prompt: "hi", maxRetries: 0 });
    await streamed.consumeStream();
    const [step] = traceSteps(await streamed.steps);
    expect(step?.key).toBe(second);
    expect(step?.failovers).toBeUndefined();
  });

  it("falls back to the next model when every key of the primary model is exhausted", async () => {
    const calls: string[] = [];
    const adapter = fakeAdapter(
      { "a:m1": () => apiError(429), "b:m1": () => apiError(429) },
      calls,
    );
    const pool = new KeyPool("fake", ["a", "b"]);
    const model = createPooledModel([target(adapter, pool, "m1"), target(adapter, pool, "m2")]);
    const result = await generateText({ model, prompt: "hi", maxRetries: 0 });
    expect(result.text).toMatch(/ok from [ab]\/m2/);
  });

  it("throws AiUnavailableError with the earliest retry time when nothing is left", async () => {
    const adapter = fakeAdapter({ a: () => apiError(429), b: () => apiError(429) }, []);
    const pool = new KeyPool("fake", ["a", "b"]);
    const model = createPooledModel([target(adapter, pool)]);
    const error = await generateText({ model, prompt: "hi", maxRetries: 0 }).catch(
      (caught) => caught,
    );
    const cause = error instanceof AiUnavailableError ? error : error?.cause;
    expect(cause).toBeInstanceOf(AiUnavailableError);
    expect((cause as AiUnavailableError).retryAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not retry a request error on other keys", async () => {
    const calls: string[] = [];
    const adapter = fakeAdapter({ a: () => apiError(400, { error: { message: "bad" } }) }, calls);
    const model = createPooledModel([target(adapter, new KeyPool("fake", ["a", "b"]))]);
    await expect(generateText({ model, prompt: "hi", maxRetries: 0 })).rejects.toThrow();
    expect(calls).toEqual(["a:m1"]);
  });

  it("fails over when a stream starts with an error part", async () => {
    const calls: string[] = [];
    const adapter = fakeAdapter({ a: () => apiError(429) }, calls);
    const model = createPooledModel([target(adapter, new KeyPool("fake", ["a", "b"]))]);
    const result = streamText({ model, prompt: "hi", maxRetries: 0 });
    expect(await result.text).toBe("stream from b");
    expect(calls).toEqual(["a:m1", "b:m1"]);
  });
});
