import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AdminActor } from "../src/admin/audit";
import {
  legacyFileSchema,
  listLegacyImports,
  previewLegacyImport,
  runLegacyImport,
  startLegacyImport,
} from "../src/admin/legacy-import";
import { db } from "../src/db";
import { addEntry } from "../src/library";
import { createGame, createUser } from "./factories";

async function setup() {
  const admin = await createUser({ role: "admin" });
  const actor: AdminActor = { id: admin.id, name: admin.displayUsername ?? admin.name };
  const owner = await createUser();
  return { actor, owner };
}

const file = legacyFileSchema.parse([
  {
    id: "a1",
    gameName: "Hollow Knight",
    gameStatus: "Bitirildi",
    gamePlatform: "Steam",
    gameScore: "9,5",
    gameTotalTime: "42",
    gameDate: "2023-04-01",
    screenshots: [{ ssUrl: "https://example.com/1.jpg", ssName: "boss" }],
  },
  { id: "a2", gameName: "Celeste", gameStatus: "Bırakıldı", gamePlatform: null },
  { id: 3, gameName: "Owned Already", gameStatus: "Bitirilecek" },
]);

describe("legacy import from the admin panel", () => {
  it("rejects files that aren't the old export", () => {
    expect(legacyFileSchema.safeParse([]).success).toBe(false);
    expect(legacyFileSchema.safeParse({ id: "x" }).success).toBe(false);
    expect(legacyFileSchema.safeParse([{ id: "x", gameStatus: "Bitirildi" }]).success).toBe(false);
  });

  it("previews without writing, then imports in the worker job and keeps only the report", async () => {
    const { actor, owner } = await setup();
    const owned = await createGame({ name: "Owned Already" });
    await addEntry(owner.id, { gameId: owned.id, status: "playing" });

    const preview = await previewLegacyImport(owner.id, file);
    expect(preview).toMatchObject({
      total: 3,
      toImport: 3,
      alreadyImported: 0,
      importedElsewhere: 0,
      screenshots: 1,
      inLibraryCount: 1,
      inLibrary: ["Owned Already"],
      statuses: { completed: 1, dropped: 1, backlog: 1 },
    });
    expect(await db.select().from(schema.legacyImports)).toHaveLength(0);

    const { id } = await startLegacyImport(actor, owner.id, {
      fileName: "kadir.json",
      records: file,
    });
    const [event] = await db
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.type, "legacy.import_requested"));
    expect(event?.payload).toEqual({ importId: id });

    // Süren aktarım varken ikincisi başlatılamaz.
    await expect(
      startLegacyImport(actor, owner.id, { fileName: "again.json", records: file }),
    ).rejects.toMatchObject({ reason: "legacy_import_running" });

    expect(await runLegacyImport(id)).toEqual({ imported: 2, total: 3 });
    const [row] = await listLegacyImports(owner.id);
    expect(row).toMatchObject({ status: "done", processed: 3, total: 3, fileName: "kadir.json" });
    expect(row?.report).toMatchObject({
      imported: 2,
      duplicates: ["Owned Already"],
      screenshots: 1,
    });
    const [stored] = await db
      .select()
      .from(schema.legacyImports)
      .where(eq(schema.legacyImports.id, id));
    expect(stored?.records).toBeNull();

    // İş tekrar gelirse (pg-boss yeniden denemesi) bir şey yapmaz.
    expect(await runLegacyImport(id)).toEqual({ skipped: true });

    const [audit] = await db.select().from(schema.adminAudit);
    expect(audit).toMatchObject({ action: "user.legacy_import", targetId: owner.id });
    expect(audit?.details).toMatchObject({ fileName: "kadir.json", records: 3 });

    // Aynı dosya tekrar: aktarılmışlar görünür, başka hesaba aktarılanlar ayrıca uyarılır.
    expect(await previewLegacyImport(owner.id, file)).toMatchObject({
      toImport: 1,
      alreadyImported: 2,
    });
    const other = await createUser();
    expect(await previewLegacyImport(other.id, file)).toMatchObject({
      toImport: 1,
      importedElsewhere: 2,
    });
  });

  it("marks the import failed and keeps the records for a retry", async () => {
    const { actor, owner } = await setup();
    const { id } = await startLegacyImport(actor, owner.id, { fileName: "x.json", records: file });
    await db
      .update(schema.legacyImports)
      .set({ records: [{ broken: true }] })
      .where(eq(schema.legacyImports.id, id));

    await expect(runLegacyImport(id)).rejects.toThrow();
    const [row] = await listLegacyImports(owner.id);
    expect(row?.status).toBe("failed");
    expect(row?.error).toBeTruthy();
    const [stored] = await db
      .select()
      .from(schema.legacyImports)
      .where(eq(schema.legacyImports.id, id));
    expect(stored?.records).not.toBeNull();
  });
});
