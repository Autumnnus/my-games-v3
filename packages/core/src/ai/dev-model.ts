import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import type { ModelPurpose } from "./providers";

/**
 * Yalnızca yerel geliştirme için sahte model (`AI_PROVIDER=mock`). API anahtarı ve maliyet olmadan bütün
 * akışı uçtan uca çalıştırır: araç çağrısı → sonuç → metin, akış, kayıt, kota ve "Yap" modunda onay kartı.
 * Mesajdaki birkaç anahtar kelimeye ve sistem talimatındaki bağlama (etiketlenen oyunun `entryId`'si,
 * `@kullanıcı`) bakarak uygun aracı seçer.
 */
export async function createDevModel(_purpose: ModelPurpose = "chat"): Promise<LanguageModel> {
  const { MockLanguageModelV4 } = await import("ai/test");
  const { simulateReadableStream } = await import("ai");
  const usage = {
    inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 20, text: 20, reasoning: undefined },
  };

  const textParts = (text: string): LanguageModelV4StreamPart[] => [
    { type: "text-start", id: "t" },
    ...text.split(/(?<=\s)/).map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
    { type: "text-end", id: "t" },
  ];
  const stream = (chunks: LanguageModelV4StreamPart[]) => ({
    stream: simulateReadableStream({ chunkDelayInMs: 12, chunks }),
  });
  const callTool = (toolName: string, input: Record<string, unknown>, before?: string) =>
    stream([
      ...(before ? textParts(before) : []),
      {
        type: "tool-call",
        toolCallId: `dev-${Date.now()}-${toolName}`,
        toolName,
        input: JSON.stringify(input),
      },
      { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
    ]);
  const answer = (text: string) =>
    stream([
      ...textParts(text),
      { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
    ]);

  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const system = prompt
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n");
      const last = prompt.at(-1);

      if (last?.role === "tool") {
        const part = last.content.find((item) => item.type === "tool-result");
        if (part?.type !== "tool-result") return answer("(dev) Tamam.");
        const output = part.output as { type: string; value?: unknown };
        if (output.type === "execution-denied") return answer("(dev) Peki, bunu değiştirmiyorum.");
        const value = (output.value ?? {}) as Record<string, unknown>;
        switch (part.toolName) {
          case "queryLibrary":
            return answer(`(dev) ${value.total ?? 0} oyun buldum.`);
          case "compareWithUser":
            return answer(
              `(dev) ${(value.counts as { ratedTogether?: number } | undefined)?.ratedTogether ?? 0} ortak oyunu puanlamışsınız; ortalama fark ${value.averageGap ?? "—"}.`,
            );
          case "getAchievements":
            return answer(`(dev) ${value.unlocked ?? 0}/${value.total ?? 0} başarım açmışsın.`);
          case "updateEntry":
          case "addToLibrary":
            return answer(
              `(dev) Tamamdır, ${(value.game as { name?: string } | undefined)?.name ?? "kayıt"} güncellendi.`,
            );
          default:
            return answer("(dev) İşte sonuç.");
        }
      }

      const text =
        last?.role === "user"
          ? last.content
              .map((item) => (item.type === "text" ? item.text : ""))
              .join(" ")
              .toLocaleLowerCase("tr")
          : "";
      const act = system.includes("## Mode: Act");
      const entryId = system.match(/entryId ([0-9a-f-]{36})/)?.[1];
      const username = system.match(/User @([\w.-]+)/)?.[1];
      const status = /bitirdim|finished/.test(text)
        ? "completed"
        : /bıraktım|dropped/.test(text)
          ? "dropped"
          : /ara verdim|paused/.test(text)
            ? "paused"
            : /başladım|oynuyorum|started/.test(text)
              ? "playing"
              : null;

      if (act && status && entryId) {
        return callTool("updateEntry", { entryId, status }, "(dev) Değişikliği hazırladım. ");
      }
      if ((/karşılaştır|compare/.test(text) || system.includes("used /compare")) && username) {
        return callTool("compareWithUser", { username });
      }
      if (/başarım|achievement/.test(text) && entryId)
        return callTool("getAchievements", { entryId });
      if (/istatistik|stats/.test(text)) return callTool("getStats", {});
      const minRating = text.match(/(\d+(?:[.,]\d)?)\s*(ve üstü|\+|üstü|and up|or more)/)?.[1];
      if (minRating) {
        return callTool("queryLibrary", {
          minRating: Number(minRating.replace(",", ".")),
          statuses: ["completed"],
          title: "Başyapıtlarım",
        });
      }
      const query = text.split(/\s+/).find((word) => word.length > 3) ?? "";
      return callTool("queryLibrary", {
        query: query.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 30),
        limit: 8,
      });
    },
  });
}
