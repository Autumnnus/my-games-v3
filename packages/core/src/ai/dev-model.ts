import type { LanguageModel } from "ai";

/**
 * Yalnızca yerel geliştirme için sahte model (`AI_PROVIDER=mock`). API anahtarı ve maliyet olmadan tüm
 * akışı (tool çağrısı → tool sonucu → metin, akış, kayıt, kota) uçtan uca çalıştırır. Kullanıcı mesajına
 * göre kütüphaneyi arar, sonra bulduklarını özetler.
 */
export async function createDevModel(): Promise<LanguageModel> {
  const { MockLanguageModelV4 } = await import("ai/test");
  const { simulateReadableStream } = await import("ai");
  const usage = {
    inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 20, text: 20, reasoning: undefined },
  };

  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const last = prompt.at(-1);
      if (last?.role === "tool") {
        const part = last.content.find((item) => item.type === "tool-result");
        const output =
          part && "output" in part ? (part.output as { value?: unknown }).value : undefined;
        const games =
          (output as { games?: Array<{ name: string; status: string }> } | undefined)?.games ?? [];
        const text = games.length
          ? `(dev) ${games.length} oyun buldum:\n${games.map((game) => `- ${game.name} (${game.status})`).join("\n")}`
          : "(dev) Kütüphanede eşleşen bir oyun bulamadım.";
        return {
          stream: simulateReadableStream({
            chunkDelayInMs: 15,
            chunks: [
              { type: "text-start", id: "t" },
              ...text
                .split(/(?<=\s)/)
                .map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
              { type: "text-end", id: "t" },
              { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
            ],
          }),
        };
      }
      const question =
        last?.role === "user"
          ? last.content.map((item) => (item.type === "text" ? item.text : "")).join(" ")
          : "";
      const query = question.split(/\s+/).find((word) => word.length > 3) ?? "";
      return {
        stream: simulateReadableStream({
          chunks: [
            {
              type: "tool-call",
              toolCallId: `dev-${Date.now()}`,
              toolName: "searchLibrary",
              input: JSON.stringify({
                query: query.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 30),
                limit: 5,
              }),
            },
            { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
          ],
        }),
      };
    },
  });
}
