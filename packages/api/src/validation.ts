import { sValidator } from "@hono/standard-validator";
import { entryStatuses, platforms, stores } from "@my-games/shared";
import type { ValidationTargets } from "hono";
import { z } from "zod";

/** Doğrulama hatalarını tek biçimde döner: `{ error: "invalid", issues }`. */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return sValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "invalid",
          issues: result.error.map((issue) => ({
            path: issue.path?.map((segment) =>
              typeof segment === "object" ? segment.key : segment,
            ),
            message: issue.message,
          })),
        },
        400,
      );
    }
  });
}

export const uuidParam = z.object({ id: z.uuid() });

const isoDate = z.iso.date();

/** UI'daki 0–10 (tek ondalık) puanı DB'deki 0–100'e çevirir. */
const rating = z
  .number()
  .min(0)
  .max(10)
  .transform((value) => Math.round(value * 10));

export const entryFieldsSchema = z.object({
  status: z.enum(entryStatuses),
  rating: rating.nullable().optional(),
  review: z.string().max(20_000).nullable().optional(),
  platform: z.enum(platforms).nullable().optional(),
  store: z.enum(stores).nullable().optional(),
  playtimeMin: z.number().int().min(0).max(1_000_000).optional(),
  startedAt: isoDate.nullable().optional(),
  finishedAt: isoDate.nullable().optional(),
  lastPlayedAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .nullable()
    .optional(),
  isFavorite: z.boolean().optional(),
});

export type EntryFieldsInput = z.infer<typeof entryFieldsSchema>;

/** API'nin `playtimeMin`'i (kullanıcının girdiği toplam) manuel süreye yazılır; Steam süresi ayrıdır. */
export function toEntryFields<T extends Partial<EntryFieldsInput>>(input: T) {
  const { playtimeMin, ...rest } = input;
  return playtimeMin === undefined ? rest : { ...rest, playtimeManualMin: playtimeMin };
}
