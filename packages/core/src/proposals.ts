import { schema } from "@my-games/db";
import type { ProposalSource, SyncAction } from "@my-games/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { importIgdbGame } from "./catalog";
import { type DbOrTx, db, type Tx } from "./db";
import { AppError, notFound } from "./errors";
import { emit } from "./events";
import { addEntry, type EntryFields, findEntryByGame, updateEntry } from "./library";
import { type MatchCandidate, mergeGameInto } from "./matching";

const { changeProposals, syncRules, syncIgnores, games, libraryEntries } = schema;

/**
 * Öneri türleri (`kind`) ve varsayılan davranışları. Kullanıcı `sync_rules` ile değiştirebilir.
 * - playtime / achievements: platformun bildirdiği sayısal değişiklikler (son oynama süreyle birlikte gelir).
 * - screenshots: Steam'de herkese açık paylaşılan ekran görüntüleri.
 * - status: durum önerisi ("2 haftadır oynuyorsun → oynanıyor").
 * - new_game: Steam kütüphanesinde, bizim kütüphanede olmayan oyun.
 * - playtime_conflict: elle girilmiş süre ile Steam süresi ilk bağlantıda çakışıyor.
 * - match: IGDB'siz oyun için IGDB eşleşme adayları.
 */
export const DEFAULT_RULES: Record<string, SyncAction> = {
  "steam:playtime": "auto",
  "steam:achievements": "auto",
  "steam:status": "ask",
  "steam:new_game": "ask",
  "steam:playtime_conflict": "ask",
  "steam:screenshots": "auto",
  "psn:playtime": "auto",
  "psn:achievements": "auto",
  "psn:status": "ask",
  "psn:new_game": "ask",
  "psn:playtime_conflict": "ask",
  "xbox:playtime": "auto",
  "xbox:achievements": "auto",
  "xbox:status": "ask",
  "xbox:new_game": "ask",
  "xbox:playtime_conflict": "ask",
  "migration:match": "ask",
  "igdb:match": "ask",
  "ai:entry_update": "ask",
  "ai:entry_create": "ask",
};

/** Kullanıcının değiştirebildiği kurallar (UI bu listeyi gösterir). */
export const CONFIGURABLE_RULES = Object.keys(DEFAULT_RULES);

export type ProposalPayload =
  | {
      op: "update";
      changes: Array<{ field: string; from: unknown; to: unknown }>;
      summary?: string;
    }
  | {
      op: "create";
      game: {
        gameId?: string;
        steamAppId?: number;
        igdbId?: number;
        name: string;
        provider?: string;
        externalId?: string;
      };
      fields: EntryFields;
    }
  | { op: "match"; gameName: string; candidates: MatchCandidate[] }
  | {
      op: "conflict";
      manualMin: number;
      /** Çakışan platform (eski öneriler yalnızca Steam içindi: `steamMin`). */
      provider?: "steam" | "psn" | "xbox";
      platformMin?: number;
      steamMin?: number;
    }
  | {
      op: "screenshots";
      items: Array<{
        externalId: string;
        url: string;
        thumbUrl: string | null;
        caption: string | null;
        width: number | null;
        height: number | null;
        takenAt: string | null;
      }>;
    };

export type ProposalInput = {
  userId: string;
  source: ProposalSource;
  kind: string;
  payload: ProposalPayload;
  entryId?: string | null;
  gameId?: string | null;
  /**
   * Aynı konudaki öneriyi tanımlar (`<source>:<kind>:<hedef>`). Bekleyen öneri varsa yenisi onun yerine
   * geçer; kullanıcı "bir daha sorma" dediyse bu anahtarla bir daha öneri üretilmez.
   */
  dedupeKey?: string | null;
  confidence?: number | null;
  /** Platformun ilk senkronunda oluştu: uygulanınca akışa aktivite düşmez. */
  initial?: boolean;
};

export type ProposalResult = {
  status: "ignored" | "auto_applied" | "pending";
  proposalId?: string;
  /** Yeni bir bekleyen öneri açıldı (mevcut öneri güncellendiyse `false`; bildirim sayılmaz). */
  created?: boolean;
};

/** "Bir daha sorma" anahtarı: dedupe anahtarından kaynak öneki atılmış hâli (ör. `new_game:620`). */
export function ignoreKey(source: string, dedupeKey: string | null | undefined) {
  if (!dedupeKey) return null;
  return dedupeKey.startsWith(`${source}:`) ? dedupeKey.slice(source.length + 1) : dedupeKey;
}

export async function isIgnored(tx: DbOrTx, userId: string, source: ProposalSource, key: string) {
  const [row] = await tx
    .select({ id: syncIgnores.externalId })
    .from(syncIgnores)
    .where(
      and(
        eq(syncIgnores.userId, userId),
        eq(syncIgnores.source, source),
        eq(syncIgnores.externalId, key),
      ),
    );
  return !!row;
}

export async function ruleFor(tx: Tx | typeof db, userId: string, source: string, kind: string) {
  const [rule] = await tx
    .select({ action: syncRules.action })
    .from(syncRules)
    .where(
      and(
        eq(syncRules.userId, userId),
        eq(syncRules.source, source as ProposalSource),
        eq(syncRules.kind, kind),
      ),
    );
  return rule?.action ?? DEFAULT_RULES[`${source}:${kind}`] ?? "ask";
}

/**
 * Bir değişiklik önerir. Kurala göre yok sayılır, hemen uygulanır ya da onay kutusuna düşer. Aynı
 * `dedupeKey` ile bekleyen öneri varsa yenisi onun yerine geçer (kullanıcı eski değeri onaylamasın).
 * Onay bekleyen öneri oluştuysa çağıran, toplu bildirim için `notifyPending` çağırmalı.
 */
export async function propose(tx: Tx, input: ProposalInput): Promise<ProposalResult> {
  const key = ignoreKey(input.source, input.dedupeKey);
  if (key && (await isIgnored(tx, input.userId, input.source, key))) return { status: "ignored" };

  const action = await ruleFor(tx, input.userId, input.source, input.kind);
  if (action === "ignore") return { status: "ignored" };

  const base = {
    userId: input.userId,
    source: input.source,
    kind: input.kind,
    payload: input.payload as Record<string, unknown>,
    entryId: input.entryId ?? null,
    gameId: input.gameId ?? null,
    dedupeKey: input.dedupeKey ?? null,
    confidence: input.confidence ?? null,
    initial: input.initial ?? false,
  };

  if (action === "auto" && input.payload.op !== "match" && input.payload.op !== "conflict") {
    const [row] = await tx
      .insert(changeProposals)
      .values({ ...base, dedupeKey: null, status: "auto_applied", resolvedAt: new Date() })
      .returning();
    if (!row) throw new AppError("conflict");
    await applyInTx(tx, row);
    if (input.dedupeKey) await supersede(tx, input.userId, input.dedupeKey, row.id);
    return { status: "auto_applied", proposalId: row.id };
  }

  if (input.dedupeKey) {
    const [existing] = await tx
      .select()
      .from(changeProposals)
      .where(
        and(
          eq(changeProposals.userId, input.userId),
          eq(changeProposals.dedupeKey, input.dedupeKey),
          eq(changeProposals.status, "pending"),
        ),
      );
    if (existing) {
      await tx
        .update(changeProposals)
        .set({ payload: base.payload, confidence: base.confidence, createdAt: new Date() })
        .where(eq(changeProposals.id, existing.id));
      return { status: "pending", proposalId: existing.id, created: false };
    }
  }

  const [row] = await tx.insert(changeProposals).values(base).returning();
  if (!row) throw new AppError("conflict");
  return { status: "pending", proposalId: row.id, created: true };
}

async function supersede(tx: Tx, userId: string, dedupeKey: string, exceptId: string) {
  await tx
    .update(changeProposals)
    .set({ status: "superseded", resolvedAt: new Date() })
    .where(
      and(
        eq(changeProposals.userId, userId),
        eq(changeProposals.dedupeKey, dedupeKey),
        eq(changeProposals.status, "pending"),
        sql`${changeProposals.id} <> ${exceptId}`,
      ),
    );
}

/** Onay bekleyen yeni öneriler için tek bir bildirim olayı yazar. */
export async function notifyPending(tx: Tx, userId: string, count: number) {
  if (count > 0) await emit(tx, "proposals.created", { userId, count });
}

type ProposalRow = typeof changeProposals.$inferSelect;

/** Transaction içinde uygulanabilen öneriler (update / create / conflict). */
async function applyInTx(tx: Tx, proposal: ProposalRow, choice?: string) {
  const payload = proposal.payload as ProposalPayload;
  // Kurulum önerileri kütüphaneye işlenir ama akışa düşmez.
  const options = {
    source: proposal.source,
    proposalId: proposal.id,
    tx,
    silent: proposal.initial,
  };

  switch (payload.op) {
    case "update": {
      if (!proposal.entryId) throw new AppError("conflict", "Önerinin kaydı yok");
      const patch = Object.fromEntries(
        payload.changes.map((change) => [change.field, reviveValue(change.field, change.to)]),
      ) as Partial<EntryFields>;
      await updateEntry(proposal.userId, proposal.entryId, patch, options);
      return;
    }
    case "create": {
      const gameId = proposal.gameId ?? payload.game.gameId;
      if (!gameId) throw new AppError("conflict", "Önerinin oyunu yok");
      if (await findEntryByGame(proposal.userId, gameId, tx)) return;
      // Payload jsonb'den gelir: tarih alanları string olarak döner.
      const fields = Object.fromEntries(
        Object.entries(payload.fields).map(([field, value]) => [field, reviveValue(field, value)]),
      ) as unknown as EntryFields;
      await addEntry(proposal.userId, { ...fields, gameId }, options);
      return;
    }
    case "conflict": {
      if (!proposal.entryId) throw new AppError("conflict", "Önerinin kaydı yok");
      // "use_platform" (eski adı "use_steam"): elle girilen süre platform süresinin içinde kabul edilir
      // ve sıfırlanır. "keep_both": elle girilen süre başka bir yerdeki oynamadır; ikisi toplanır.
      const field = PLAYTIME_FIELDS[payload.provider ?? "steam"];
      const minutes = payload.platformMin ?? payload.steamMin ?? 0;
      const usePlatform = (choice ?? "use_platform") !== "keep_both";
      await updateEntry(
        proposal.userId,
        proposal.entryId,
        usePlatform ? { playtimeManualMin: 0, [field]: minutes } : { [field]: minutes },
        options,
      );
      return;
    }
    case "screenshots": {
      if (!proposal.entryId) throw new AppError("conflict", "Önerinin kaydı yok");
      const { insertPlatformScreenshots } = await import("./screenshots");
      await insertPlatformScreenshots(tx, {
        userId: proposal.userId,
        entryId: proposal.entryId,
        gameId: proposal.gameId,
        items: payload.items,
        announce: !proposal.initial,
      });
      return;
    }
    case "match":
      throw new AppError("invalid", "Eşleştirme önerisi transaction dışında uygulanır");
  }
}

const PLAYTIME_FIELDS = {
  steam: "playtimeSteamMin",
  psn: "playtimePsnMin",
  xbox: "playtimeXboxMin",
} as const;

function reviveValue(field: string, value: unknown) {
  if (field === "lastPlayedAt" && typeof value === "string") return new Date(value);
  return value;
}

/** Öneriyi bu kullanıcı için "sonuçlandı" olarak işaretler; zaten sonuçlanmışsa hata verir. */
async function claim(tx: Tx, userId: string, id: string, status: "approved" | "rejected") {
  const [proposal] = await tx
    .update(changeProposals)
    .set({ status, resolvedAt: new Date() })
    .where(
      and(
        eq(changeProposals.id, id),
        eq(changeProposals.userId, userId),
        eq(changeProposals.status, "pending"),
      ),
    )
    .returning();
  if (proposal) return proposal;
  const [existing] = await tx
    .select({ userId: changeProposals.userId })
    .from(changeProposals)
    .where(eq(changeProposals.id, id));
  if (!existing || existing.userId !== userId) notFound("Öneri bulunamadı");
  throw new AppError("conflict", "Öneri zaten sonuçlandı");
}

/** Reddedilince bir daha sorulmayan türler: aynı cevap her sync'te tekrar sorulmasın. */
const FINAL_ON_REJECT = new Set(["playtime_conflict", "match"]);

/**
 * Kullanıcının onayı/reddi. `choice`: eşleştirmede seçilen IGDB id'si (önerilen adaylardan biri), süre
 * çakışmasında `use_steam` | `keep_both`. `ignore`: reddedilen şey için bir daha öneri üretilmez.
 */
export async function resolveProposal(
  userId: string,
  id: string,
  action: "approve" | "reject",
  options: { choice?: string; ignore?: boolean } = {},
) {
  const [peek] = await db
    .select({ payload: changeProposals.payload })
    .from(changeProposals)
    .where(and(eq(changeProposals.id, id), eq(changeProposals.userId, userId)));
  const peekPayload = peek?.payload as ProposalPayload | undefined;

  if (action === "approve" && peekPayload?.op === "match") {
    const igdbId = Number(options.choice ?? peekPayload.candidates[0]?.igdbId);
    if (!peekPayload.candidates.some((candidate) => candidate.igdbId === igdbId)) {
      throw new AppError("invalid", "Önerilen adaylardan biri seçilmeli");
    }
    // IGDB çağrısı transaction dışında; oyun zaten içe aktarılmışsa ağa çıkmaz.
    const target = await importIgdbGame(igdbId);
    await db.transaction(async (tx) => {
      const proposal = await claim(tx, userId, id, "approved");
      if (!proposal.gameId) throw new AppError("conflict", "Önerinin oyunu yok");
      // Katalog oyunu herkesin; kullanıcının onayı yalnızca kendi kaydını taşır.
      await mergeGameInto(tx, proposal.gameId, target.id, { userId });
    });
    return;
  }

  await db.transaction(async (tx) => {
    const proposal = await claim(tx, userId, id, action === "approve" ? "approved" : "rejected");
    if (action === "approve") await applyInTx(tx, proposal, options.choice);
    if (action === "reject" && (options.ignore || FINAL_ON_REJECT.has(proposal.kind))) {
      const key = ignoreKey(proposal.source, proposal.dedupeKey);
      if (key) {
        const [game] = proposal.gameId
          ? await tx.select({ name: games.name }).from(games).where(eq(games.id, proposal.gameId))
          : [];
        await tx
          .insert(syncIgnores)
          .values({ userId, source: proposal.source, externalId: key, label: game?.name ?? null })
          .onConflictDoNothing();
      }
    }
  });
}

export async function resolveMany(userId: string, ids: string[], action: "approve" | "reject") {
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids.slice(0, 200)) {
    try {
      await resolveProposal(userId, id, action);
      results.push({ id, ok: true });
    } catch (error) {
      results.push({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export async function listProposals(
  userId: string,
  status: "pending" | "resolved" = "pending",
  limit = 100,
) {
  const statusFilter =
    status === "pending"
      ? eq(changeProposals.status, "pending")
      : inArray(changeProposals.status, ["approved", "rejected", "auto_applied"]);
  return db
    .select({
      id: changeProposals.id,
      source: changeProposals.source,
      kind: changeProposals.kind,
      initial: changeProposals.initial,
      payload: changeProposals.payload,
      status: changeProposals.status,
      confidence: changeProposals.confidence,
      createdAt: changeProposals.createdAt,
      resolvedAt: changeProposals.resolvedAt,
      entryId: changeProposals.entryId,
      game: {
        id: games.id,
        name: games.name,
        slug: games.slug,
        coverImageId: games.coverImageId,
        coverUrl: games.coverUrl,
        heroUrl: games.heroUrl,
        accentColor: games.accentColor,
      },
      entry: {
        status: libraryEntries.status,
        playtimeManualMin: libraryEntries.playtimeManualMin,
        playtimeSteamMin: libraryEntries.playtimeSteamMin,
      },
    })
    .from(changeProposals)
    .leftJoin(games, eq(games.id, changeProposals.gameId))
    .leftJoin(libraryEntries, eq(libraryEntries.id, changeProposals.entryId))
    .where(and(eq(changeProposals.userId, userId), statusFilter))
    .orderBy(desc(status === "pending" ? changeProposals.createdAt : changeProposals.resolvedAt))
    .limit(Math.min(limit, 500));
}

export async function pendingCount(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(changeProposals)
    .where(and(eq(changeProposals.userId, userId), eq(changeProposals.status, "pending")));
  return row?.count ?? 0;
}

export async function getRules(userId: string) {
  const rows = await db.select().from(syncRules).where(eq(syncRules.userId, userId));
  const overrides = new Map(rows.map((row) => [`${row.source}:${row.kind}`, row.action]));
  return CONFIGURABLE_RULES.map((key) => {
    const [source, kind] = key.split(":") as [ProposalSource, string];
    return {
      source,
      kind,
      action: overrides.get(key) ?? DEFAULT_RULES[key] ?? "ask",
      default: DEFAULT_RULES[key],
    };
  });
}

export async function setRule(
  userId: string,
  source: ProposalSource,
  kind: string,
  action: SyncAction,
) {
  if (!CONFIGURABLE_RULES.includes(`${source}:${kind}`))
    throw new AppError("invalid", "Bilinmeyen kural");
  await db
    .insert(syncRules)
    .values({ userId, source, kind, action })
    .onConflictDoUpdate({
      target: [syncRules.userId, syncRules.source, syncRules.kind],
      set: { action },
    });
}

export async function listIgnores(userId: string) {
  return db.select().from(syncIgnores).where(eq(syncIgnores.userId, userId));
}

export async function removeIgnore(userId: string, source: ProposalSource, externalId: string) {
  await db
    .delete(syncIgnores)
    .where(
      and(
        eq(syncIgnores.userId, userId),
        eq(syncIgnores.source, source),
        eq(syncIgnores.externalId, externalId),
      ),
    );
}
