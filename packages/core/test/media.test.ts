import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db";
import { addEntry, deleteEntry } from "../src/library";
import {
  adminStorageOverview,
  cancelPendingAssets,
  cleanupPendingAssets,
  reserveUploads,
  setDefaultQuota,
  setUploadQuality,
  setUserQuota,
  storageUsage,
  type VariantInput,
} from "../src/media";
import {
  confirmScreenshotUploads,
  createScreenshotUploads,
  deleteScreenshot,
  listScreenshots,
} from "../src/screenshots";
import { confirmAvatar, createAvatarUpload } from "../src/users";
import { createGame, createUser, mockFetch } from "./factories";

// Depoya ağ isteği yok: imzalama yereldir, HEAD yanıtları sahte. Gerçek yükleme screenshots.test.ts'te (MinIO).
const endpoint = "https://s3.test";
const MB = 1024 * 1024;

const env = {
  S3_ENDPOINT: endpoint,
  S3_REGION: "auto",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_PUBLIC_URL: "https://cdn.test",
  STORAGE_DEFAULT_QUOTA_MB: "1",
};

beforeEach(() => {
  Object.assign(process.env, env);
  delete process.env.STORAGE_BUDGET_GB;
});

afterAll(() => {
  for (const name of [...Object.keys(env), "STORAGE_BUDGET_GB"]) delete process.env[name];
});

const optimized = (fullBytes: number, thumbBytes = 10_000): VariantInput[] => [
  { name: "full", contentType: "image/avif", bytes: fullBytes, width: 2560, height: 1440 },
  { name: "thumb", contentType: "image/avif", bytes: thumbBytes, width: 640, height: 360 },
];

/** Depodaki nesneler: HEAD bu listeye göre yanıt verir. */
let stored = new Map<string, { bytes: number; contentType: string }>();
let fetchMock: ReturnType<typeof mockFetch> | undefined;

function fakeStorage() {
  stored = new Map();
  fetchMock = mockFetch([
    {
      // aws4fetch `Request` nesnesi gönderir; bu testlerde depoya giden tek istek HEAD.
      match: (url) => url.startsWith(endpoint),
      respond: (url) => {
        const object = stored.get(new URL(url).pathname.replace("/bucket/", ""));
        return object
          ? new Response(null, {
              status: 200,
              headers: {
                "content-length": String(object.bytes),
                "content-type": object.contentType,
              },
            })
          : new Response(null, { status: 404 });
      },
    },
  ]);
}

afterEach(() => {
  fetchMock?.restore();
  fetchMock = undefined;
});

/** Tarayıcının yaptığı gibi her varyantı "yükler". */
function putAll(
  assets: Array<{ id: string }>,
  variants: VariantInput[],
  userId: string,
  purpose = "screenshots",
) {
  for (const asset of assets) {
    for (const variant of variants) {
      const extension = variant.contentType.split("/")[1]?.replace("jpeg", "jpg");
      stored.set(`users/${userId}/${purpose}/${asset.id}/${variant.name}.${extension}`, {
        bytes: variant.bytes,
        contentType: variant.contentType,
      });
    }
  }
}

async function orphanedKeys() {
  const events = await db
    .select()
    .from(schema.outbox)
    .where(eq(schema.outbox.type, "storage.objects_orphaned"));
  return events.flatMap((event) => (event.payload as { keys: string[] }).keys);
}

async function setup() {
  const owner = await createUser();
  const game = await createGame();
  const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
  return { owner, game, entry };
}

describe("media uploads", () => {
  it("signs one URL per variant under the user's folder", async () => {
    const { owner, entry } = await setup();
    const [asset] = await createScreenshotUploads(owner.id, entry.id, {
      quality: "optimized",
      files: [{ variants: optimized(200_000) }],
    });
    if (!asset) throw new Error("no asset");
    expect(asset.variants.map((variant) => variant.name).sort()).toEqual(["full", "thumb"]);
    const full = asset.variants.find((variant) => variant.name === "full");
    const url = new URL(full?.upload.url ?? "");
    expect(url.pathname).toBe(`/bucket/users/${owner.id}/screenshots/${asset.id}/full.avif`);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("cache-control");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
    expect(full?.upload.headers).toEqual({
      "Content-Type": "image/avif",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });

  it("enforces the variant rules of each quality", async () => {
    const { owner, entry } = await setup();
    const attempt = (quality: "optimized" | "original", variants: VariantInput[]) =>
      createScreenshotUploads(owner.id, entry.id, { quality, files: [{ variants }] });

    // Küçük görsel zorunlu.
    await expect(attempt("optimized", optimized(1000).slice(0, 1))).rejects.toMatchObject({
      code: "invalid",
    });
    // Optimize modda PNG kabul edilmez, orijinal modda edilir.
    const png: VariantInput = { name: "full", contentType: "image/png", bytes: 1000 };
    await expect(
      attempt("optimized", [png, optimized(1)[1] as VariantInput]),
    ).rejects.toMatchObject({ code: "invalid" });
    // Orijinal modda gösterim kopyası da zorunlu.
    await expect(attempt("original", [png, optimized(1)[1] as VariantInput])).rejects.toMatchObject(
      {
        code: "invalid",
      },
    );
    const [asset] = await attempt("original", [
      png,
      { name: "display", contentType: "image/avif", bytes: 500 },
      { name: "thumb", contentType: "image/avif", bytes: 100 },
    ]);
    expect(asset?.variants).toHaveLength(3);
    // Küçültülmemiş görsel (bildirilen boyut sınırı aşıyor) reddedilir.
    await expect(
      attempt("optimized", [
        { name: "full", contentType: "image/avif", bytes: 1000, width: 3840, height: 2160 },
        optimized(1)[1] as VariantInput,
      ]),
    ).rejects.toMatchObject({ code: "invalid" });
    // Avatar için orijinal yok.
    await expect(
      reserveUploads(owner.id, {
        purpose: "avatar",
        quality: "original",
        files: [{ variants: [png] }],
      }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("counts pending uploads against the quota and serializes concurrent reservations", async () => {
    const { owner, entry } = await setup();
    // Kota 1 MB; her deneme ~310 KB → aynı anda 5 istekten en fazla 3'ü geçer.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        createScreenshotUploads(owner.id, entry.id, {
          quality: "optimized",
          files: [{ variants: optimized(300 * 1024) }],
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: "storage_quota" });

    const usage = await storageUsage(owner.id);
    expect(usage.quotaBytes).toBe(MB);
    expect(usage.pendingBytes).toBe(3 * (300 * 1024 + 10_000));
  });

  it("lets admins raise a user's quota and change the default", async () => {
    const { owner, entry } = await setup();
    const admin = await createUser({ role: "admin" });
    const big = { quality: "optimized" as const, files: [{ variants: optimized(2 * MB) }] };
    await expect(createScreenshotUploads(owner.id, entry.id, big)).rejects.toMatchObject({
      code: "storage_quota",
    });

    const updated = await setUserQuota(admin.id, owner.id, 5 * MB, "turnuva");
    expect(updated).toMatchObject({ quotaBytes: 5 * MB, customQuota: true, quotaNote: "turnuva" });
    await createScreenshotUploads(owner.id, entry.id, big);

    // Özel kota kaldırılınca varsayılana döner; varsayılan deploy'suz değişir.
    await setUserQuota(admin.id, owner.id, null);
    expect((await storageUsage(owner.id)).quotaBytes).toBe(MB);
    await setDefaultQuota(10 * MB);
    expect((await storageUsage(owner.id)).quotaBytes).toBe(10 * MB);

    const overview = await adminStorageOverview();
    expect(overview.users[0]).toMatchObject({ userId: owner.id, quotaBytes: 10 * MB });
  });

  it("closes uploads for everyone when the system budget is full and alerts admins", async () => {
    const { owner, entry } = await setup();
    const admin = await createUser({ role: "admin" });
    await setDefaultQuota(100 * MB);
    process.env.STORAGE_BUDGET_GB = String(1 / 1024); // 1 MB

    // %80'i geçen yükleme adminlere bir kez bildirim düşürür.
    await createScreenshotUploads(owner.id, entry.id, {
      quality: "optimized",
      files: [{ variants: optimized(850 * 1024) }],
    });
    const alerts = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.recipientId, admin.id));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.data).toMatchObject({ kind: "storage_budget" });

    await expect(
      createScreenshotUploads(owner.id, entry.id, {
        quality: "optimized",
        files: [{ variants: optimized(200 * 1024) }],
      }),
    ).rejects.toMatchObject({ code: "storage_full" });
    expect((await storageUsage(owner.id)).systemFull).toBe(false);
  });

  it("confirms verified uploads and presents their addresses", async () => {
    fakeStorage();
    const { owner, entry } = await setup();
    const variants = optimized(200_000);
    const assets = await createScreenshotUploads(owner.id, entry.id, {
      quality: "optimized",
      files: [{ variants }],
    });
    putAll(assets, variants, owner.id);
    const [shot] = await confirmScreenshotUploads(owner.id, entry.id, [
      { assetId: assets[0]?.id ?? "", caption: " boss " },
    ]);
    const base = `https://cdn.test/users/${owner.id}/screenshots/${assets[0]?.id}`;
    expect(shot).toMatchObject({
      caption: "boss",
      url: `${base}/full.avif`,
      thumbUrl: `${base}/thumb.avif`,
      originalUrl: null,
      width: 2560,
      height: 1440,
    });

    // Aynı yükleme ikinci kez onaylanamaz.
    await expect(
      confirmScreenshotUploads(owner.id, entry.id, [{ assetId: assets[0]?.id ?? "" }]),
    ).rejects.toMatchObject({ code: "not_found" });

    const usage = await storageUsage(owner.id);
    expect(usage.breakdown.screenshot).toEqual({ count: 1, bytes: 210_000 });
    expect(usage.pendingBytes).toBe(0);
  });

  it("shows the display copy for originals and links the untouched file", async () => {
    fakeStorage();
    const { owner, entry } = await setup();
    const variants: VariantInput[] = [
      { name: "full", contentType: "image/png", bytes: 800_000, width: 3440, height: 1440 },
      { name: "display", contentType: "image/avif", bytes: 90_000, width: 2560, height: 1072 },
      { name: "thumb", contentType: "image/avif", bytes: 9_000, width: 640, height: 268 },
    ];
    const assets = await createScreenshotUploads(owner.id, entry.id, {
      quality: "original",
      files: [{ variants }],
    });
    putAll(assets, variants, owner.id);
    await confirmScreenshotUploads(owner.id, entry.id, [{ assetId: assets[0]?.id ?? "" }]);
    const [listed] = await listScreenshots({ entryId: entry.id });
    const base = `https://cdn.test/users/${owner.id}/screenshots/${assets[0]?.id}`;
    expect(listed).toMatchObject({
      url: `${base}/display.avif`,
      originalUrl: `${base}/full.png`,
      width: 3440,
      sizeBytes: 899_000,
    });
  });

  it("rejects uploads that are missing or differ from what was declared", async () => {
    fakeStorage();
    const { owner, entry } = await setup();
    const variants = optimized(200_000);
    const assets = await createScreenshotUploads(owner.id, entry.id, {
      quality: "optimized",
      files: [{ variants }],
    });
    // Sadece küçük görsel yüklendi.
    putAll(assets, variants.slice(1), owner.id);
    await expect(
      confirmScreenshotUploads(owner.id, entry.id, [{ assetId: assets[0]?.id ?? "" }]),
    ).rejects.toMatchObject({ code: "invalid" });
    // Görsel silindi, kota geri geldi, dosyalar temizliğe gitti.
    expect((await storageUsage(owner.id)).usedBytes).toBe(0);
    expect(await orphanedKeys()).toHaveLength(2);
  });

  it("does not let another user confirm someone else's upload", async () => {
    fakeStorage();
    const { owner, entry } = await setup();
    const other = await setup();
    const assets = await createScreenshotUploads(owner.id, entry.id, {
      quality: "optimized",
      files: [{ variants: optimized(1000) }],
    });
    putAll(assets, optimized(1000), owner.id);
    await expect(
      confirmScreenshotUploads(other.owner.id, other.entry.id, [{ assetId: assets[0]?.id ?? "" }]),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("frees the quota when a screenshot or its entry is deleted", async () => {
    fakeStorage();
    const { owner, entry } = await setup();
    const variants = optimized(100_000);
    const assets = await createScreenshotUploads(owner.id, entry.id, {
      quality: "optimized",
      files: [{ variants }, { variants }],
    });
    putAll(assets, variants, owner.id);
    const [first] = await confirmScreenshotUploads(
      owner.id,
      entry.id,
      assets.map((asset) => ({ assetId: asset.id })),
    );

    await deleteScreenshot(owner.id, first?.id ?? "");
    expect((await storageUsage(owner.id)).breakdown.screenshot.count).toBe(1);
    await deleteEntry(owner.id, entry.id);
    expect((await storageUsage(owner.id)).usedBytes).toBe(0);
    expect(await orphanedKeys()).toHaveLength(4);
  });

  it("replaces the avatar, even when the quota is full", async () => {
    fakeStorage();
    const { owner, entry } = await setup();
    const avatarVariants: VariantInput[] = [
      { name: "full", contentType: "image/avif", bytes: 40_000, width: 512, height: 512 },
      { name: "thumb", contentType: "image/avif", bytes: 4_000, width: 128, height: 128 },
    ];
    const first = await createAvatarUpload(owner.id, avatarVariants);
    putAll([first], avatarVariants, owner.id, "avatar");
    const { image } = await confirmAvatar(owner.id, first.id);
    expect(image).toBe(`https://cdn.test/users/${owner.id}/avatar/${first.id}/full.avif`);

    // Kotanın kalanını doldur.
    const used = (await storageUsage(owner.id)).usedBytes;
    await createScreenshotUploads(owner.id, entry.id, {
      quality: "optimized",
      files: [{ variants: optimized(MB - used - 10_000) }],
    });

    const second = await createAvatarUpload(owner.id, avatarVariants);
    putAll([second], avatarVariants, owner.id, "avatar");
    await confirmAvatar(owner.id, second.id);
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, owner.id));
    expect(row?.image).toContain(second.id);
    expect((await storageUsage(owner.id)).breakdown.avatar.count).toBe(1);
    expect((await orphanedKeys()).every((key) => key.includes(first.id))).toBe(true);
  });

  it("removes abandoned uploads after an hour", async () => {
    const { owner, entry } = await setup();
    const [old] = await createScreenshotUploads(owner.id, entry.id, {
      quality: "optimized",
      files: [{ variants: optimized(1000) }],
    });
    await createScreenshotUploads(owner.id, entry.id, {
      quality: "optimized",
      files: [{ variants: optimized(1000) }],
    });
    await db
      .update(schema.mediaAssets)
      .set({ createdAt: new Date(Date.now() - 2 * 60 * 60_000) })
      .where(eq(schema.mediaAssets.id, old?.id ?? ""));

    expect(await cleanupPendingAssets()).toEqual({ removed: 1 });
    expect((await storageUsage(owner.id)).pendingBytes).toBe(11_000);
    expect(await orphanedKeys()).toHaveLength(2);
  });

  it("releases a failed upload right away", async () => {
    const { owner, entry } = await setup();
    const other = await createUser();
    const assets = await createScreenshotUploads(owner.id, entry.id, {
      quality: "optimized",
      files: [{ variants: optimized(1000) }],
    });
    const ids = assets.map((asset) => asset.id);
    // Başkasının yüklemesi bırakılamaz.
    await cancelPendingAssets(other.id, ids);
    expect((await storageUsage(owner.id)).pendingBytes).toBe(11_000);
    await cancelPendingAssets(owner.id, ids);
    expect((await storageUsage(owner.id)).pendingBytes).toBe(0);
  });

  it("remembers the preferred upload quality", async () => {
    const owner = await createUser();
    expect((await storageUsage(owner.id)).uploadQuality).toBe("optimized");
    await setUploadQuality(owner.id, "original");
    expect((await storageUsage(owner.id)).uploadQuality).toBe("original");
  });
});
