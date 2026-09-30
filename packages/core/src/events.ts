import { schema } from "@my-games/db";
import type { EntryStatus, SocialTarget } from "@my-games/shared";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "./db";

/** Worker'ın tükettiği olaylar. Yeni olay = buraya tip + worker'da tüketici. */
export type DomainEvent =
  | {
      type: "entry.created";
      payload: {
        entryId: string;
        userId: string;
        gameId: string;
        status: EntryStatus;
        source: string;
        /** Akışa aktivite düşmez. Eski olaylarda alan yok. */
        silent?: boolean;
      };
    }
  | {
      type: "entry.updated";
      payload: {
        entryId: string;
        userId: string;
        gameId: string;
        source: string;
        silent?: boolean;
        changes: { field: string; from: unknown; to: unknown }[];
      };
    }
  | { type: "entry.deleted"; payload: { entryId: string; userId: string; gameId: string } }
  | {
      type: "playtime.recorded";
      payload: {
        userId: string;
        gameId: string;
        entryId: string;
        minutes: number;
        totalMin: number;
      };
    }
  | {
      type: "screenshots.added";
      payload: { userId: string; gameId: string; entryId: string; screenshotIds: string[] };
    }
  | {
      type: "comment.created";
      payload: {
        commentId: string;
        authorId: string;
        targetType: SocialTarget;
        targetId: string;
        parentId: string | null;
        /** Doğrudan yanıtlanan yorum (tek seviye yanıtta `parentId` kök yorumdur). */
        replyToId: string | null;
        mentions: string[];
      };
    }
  | {
      type: "reaction.created";
      payload: { userId: string; targetType: SocialTarget; targetId: string };
    }
  | {
      type: "achievements.unlocked";
      payload: {
        userId: string;
        entryId: string;
        gameId: string;
        provider: string;
        gameKey: string;
        apiNames: string[];
      };
    }
  | { type: "proposals.created"; payload: { userId: string; count: number } }
  | { type: "notification.push"; payload: { notificationId: string } }
  | { type: "steam.sync_requested"; payload: { userId: string } }
  | { type: "platform.sync_requested"; payload: { userId: string; provider: "psn" | "xbox" } }
  | { type: "igdb.match_requested"; payload: { gameId: string } }
  /** Platform sync'i bitti: takipten önceki geçmiş tahmini güncellenmeli (bkz. core/estimates). */
  | { type: "estimates.requested"; payload: { userId: string } }
  /** Silinen kayıtların depodaki dosyaları (kayıt silinince R2'de sahipsiz kalmasın). */
  | { type: "storage.objects_orphaned"; payload: { keys: string[]; targetId?: string | null } };

export type EventType = DomainEvent["type"];
export type EventPayload<T extends EventType> = Extract<DomainEvent, { type: T }>["payload"];

export const OUTBOX_CHANNEL = "outbox";

/**
 * Olayı çağıranın transaction'ı içinde outbox'a yazar. Transaction commit olunca NOTIFY iletilir ve worker
 * beklemeden uyanır; iptal olursa olay da yok olur.
 */
export async function emit<T extends EventType>(tx: DbOrTx, type: T, payload: EventPayload<T>) {
  await tx.insert(schema.outbox).values({ type, payload });
  await tx.execute(sql`select pg_notify(${OUTBOX_CHANNEL}, ${type})`);
}
