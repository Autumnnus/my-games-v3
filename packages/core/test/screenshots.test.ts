import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/db";
import { addEntry } from "../src/library";
import type { VariantInput } from "../src/media";
import {
  confirmScreenshotUploads,
  createScreenshotUploads,
  deleteScreenshot,
  listScreenshots,
} from "../src/screenshots";
import { deleteObject, storageFor } from "../src/storage";
import { createGame, createUser } from "./factories";

// Yerel MinIO'ya (docker compose) gerçekten yükler. MinIO çalışmıyorsa bu dosya atlanır.
const endpoint = "http://localhost:9100";
const available = await fetch(`${endpoint}/minio/health/live`)
  .then((response) => response.ok)
  .catch(() => false);

const env = {
  S3_ENDPOINT: endpoint,
  S3_REGION: "us-east-1",
  S3_BUCKET: "my-games",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_PUBLIC_URL: `${endpoint}/my-games`,
};

beforeAll(() => {
  Object.assign(process.env, env);
});

afterAll(() => {
  for (const name of Object.keys(env)) delete process.env[name];
});

const variants: VariantInput[] = [
  { name: "full", contentType: "image/avif", bytes: 2048, width: 1920, height: 1080 },
  { name: "thumb", contentType: "image/avif", bytes: 512, width: 640, height: 360 },
];

async function setup() {
  const owner = await createUser();
  const game = await createGame();
  const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
  const [asset] = await createScreenshotUploads(owner.id, entry.id, {
    quality: "optimized",
    files: [{ variants }],
  });
  if (!asset) throw new Error("no asset");
  const upload = (name: string) => {
    const target = asset.variants.find((variant) => variant.name === name)?.upload;
    if (!target) throw new Error(`no ${name}`);
    return target;
  };
  return { owner, game, entry, asset, upload };
}

describe.skipIf(!available)("screenshots (MinIO)", () => {
  it("uploads through presigned URLs, confirms and cleans up", async () => {
    const { owner, game, entry, asset, upload } = await setup();

    for (const variant of variants) {
      const target = upload(variant.name);
      const response = await fetch(target.url, {
        method: target.method,
        headers: target.headers,
        body: new Uint8Array(variant.bytes).fill(7),
      });
      expect(response.status).toBe(200);
    }

    const [saved] = await confirmScreenshotUploads(owner.id, entry.id, [{ assetId: asset.id }]);
    expect(saved?.url).toBe(
      `${endpoint}/my-games/users/${owner.id}/screenshots/${asset.id}/full.avif`,
    );

    // Herkese açık adresten, bir yıllık önbellek başlığıyla okunur.
    const publicResponse = await fetch(saved?.url ?? "");
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await listScreenshots({ gameId: game.id })).toHaveLength(1);

    // Silme dosyaları worker kuyruğuna atar; worker'ın yaptığı gibi silince nesneler gider.
    await deleteScreenshot(owner.id, saved?.id ?? "");
    expect(await listScreenshots({ gameId: game.id })).toHaveLength(0);
    const [event] = await db
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.type, "storage.objects_orphaned"));
    if (!event) throw new Error("no cleanup event");
    const keys = (event.payload as { keys: string[] }).keys;
    expect(keys).toHaveLength(2);
    for (const key of keys) await deleteObject(key);
    const storage = storageFor(null);
    for (const key of keys) expect(await storage.stat(key)).toBeNull();
  });

  it("signs type, size and cache headers into the upload URL", async () => {
    const { upload } = await setup();
    const target = upload("full");

    const bigger = await fetch(target.url, {
      method: "PUT",
      headers: target.headers,
      body: new Uint8Array(5000),
    });
    expect(bigger.ok).toBe(false);
    const html = await fetch(target.url, {
      method: "PUT",
      headers: { ...target.headers, "Content-Type": "text/html" },
      body: new Uint8Array(2048),
    });
    expect(html.ok).toBe(false);
    const noCache = await fetch(target.url, {
      method: "PUT",
      headers: { "Content-Type": "image/avif" },
      body: new Uint8Array(2048),
    });
    expect(noCache.ok).toBe(false);
  });

  it("never signs keys outside the server's layout", async () => {
    const storage = storageFor(null);
    const id = crypto.randomUUID();
    for (const key of [
      `users/abc/../other/screenshots/${id}/full.avif`,
      `users/abc/screenshots/${id}/full.html`,
      `screenshots/abc/${id}.webp`,
    ]) {
      await expect(
        storage.prepareUpload({ key, contentType: "image/avif", bytes: 10 }),
      ).rejects.toMatchObject({ code: "invalid" });
    }
  });
});
