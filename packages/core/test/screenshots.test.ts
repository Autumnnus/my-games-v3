import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addEntry } from "../src/library";
import {
  confirmUploads,
  createUploadTargets,
  deleteScreenshot,
  listScreenshots,
} from "../src/screenshots";
import { headObject } from "../src/storage";
import { createGame, createUser } from "./factories";

// Yerel MinIO'ya (docker compose) gerçekten yükler. MinIO çalışmıyorsa bu dosya atlanır.
const endpoint = "http://localhost:9100";
const available = await fetch(`${endpoint}/minio/health/live`)
  .then((response) => response.ok)
  .catch(() => false);

beforeAll(() => {
  Object.assign(process.env, {
    S3_ENDPOINT: endpoint,
    S3_REGION: "us-east-1",
    S3_BUCKET: "my-games",
    S3_ACCESS_KEY_ID: "minioadmin",
    S3_SECRET_ACCESS_KEY: "minioadmin",
    S3_PUBLIC_URL: `${endpoint}/my-games`,
    UPLOAD_MAX_BYTES: String(1024 * 1024),
  });
});

afterAll(() => {
  for (const name of [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_PUBLIC_URL",
  ]) {
    delete process.env[name];
  }
});

describe.skipIf(!available)("screenshots (MinIO)", () => {
  it("uploads through presigned URLs, confirms and deletes", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });

    const bytes = new Uint8Array(2048).fill(7);
    const [target] = await createUploadTargets(owner.id, entry.id, [
      { contentType: "image/webp", size: bytes.length, thumbSize: bytes.length },
    ]);
    if (!target) throw new Error("no target");
    expect(target.key.startsWith(`screenshots/${owner.id}/`)).toBe(true);

    for (const upload of [target.upload, target.thumbUpload]) {
      const response = await fetch(upload.url, {
        method: "PUT",
        headers: upload.headers,
        body: bytes,
      });
      expect(response.status).toBe(200);
    }

    const [saved] = await confirmUploads(owner.id, entry.id, [
      { key: target.key, thumbKey: target.thumbKey, width: 1920, height: 1080, caption: " boss " },
    ]);
    expect(saved?.caption).toBe("boss");
    expect(saved?.url).toBe(`${endpoint}/my-games/${target.key}`);

    const publicResponse = await fetch(saved?.url ?? "");
    expect(publicResponse.status).toBe(200);

    const listed = await listScreenshots({ gameId: game.id });
    expect(listed).toHaveLength(1);

    await deleteScreenshot(owner.id, saved?.id ?? "");
    expect(await headObject(target.key)).toBeNull();
    expect(await listScreenshots({ gameId: game.id })).toHaveLength(0);
  });

  it("rejects keys outside the user's prefix, including path traversal", async () => {
    const owner = await createUser();
    const other = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
    const uuid = crypto.randomUUID();

    for (const key of [
      `screenshots/${other.id}/${uuid}.webp`,
      `screenshots/${owner.id}/../${other.id}/${uuid}.webp`,
      `screenshots/${owner.id}/../../avatars/${other.id}/${uuid}.webp`,
    ]) {
      await expect(
        confirmUploads(owner.id, entry.id, [
          { key, thumbKey: key.replace(/\.(\w+)$/, "_thumb.$1") },
        ]),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
    // Küçük resim anahtarı orijinalden türetilmiş olmalı.
    const key = `screenshots/${owner.id}/${uuid}.webp`;
    await expect(
      confirmUploads(owner.id, entry.id, [{ key, thumbKey: key }]),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("signs content type and size into the upload URL", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });

    const [target] = await createUploadTargets(owner.id, entry.id, [
      { contentType: "image/png", size: 100, thumbSize: 100 },
    ]);
    if (!target) throw new Error("no target");
    const bigger = await fetch(target.upload.url, {
      method: "PUT",
      headers: target.upload.headers,
      body: new Uint8Array(5000),
    });
    expect(bigger.ok).toBe(false);
    const html = await fetch(target.upload.url, {
      method: "PUT",
      headers: { "Content-Type": "text/html" },
      body: new Uint8Array(100),
    });
    expect(html.ok).toBe(false);
    expect(await headObject(target.key)).toBeNull();

    await expect(
      createUploadTargets(owner.id, entry.id, [
        { contentType: "image/png", size: 1024 * 1024 + 1, thumbSize: 100 },
      ]),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("rejects unsupported content types", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
    await expect(
      createUploadTargets(owner.id, entry.id, [
        { contentType: "image/svg+xml", size: 10, thumbSize: 10 },
      ]),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});
