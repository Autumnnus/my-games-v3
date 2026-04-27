import { z } from "zod";

export const addTextScreenshotSchema = z.object({
  type: z.literal("text"),
  payload: z
    .array(
      z.object({
        name: z.string().optional(),
        url: z.string().url(),
      }),
    )
    .min(1),
});

export const addExternalScreenshotSchema = z.object({
  type: z.literal("external"),
  payload: z
    .array(
      z.object({
        url: z.string().url(),
        thumbnail: z.string().url().optional(),
        name: z.string().optional(),
      }),
    )
    .min(1),
});

export const editTextScreenshotSchema = z.object({
  name: z.string().optional(),
  url: z.string().url().optional(),
});

export const bulkDeleteScreenshotSchema = z.object({
  screenshotIds: z.array(z.string().min(1)).min(1),
});

export const randomScreenshotsQuerySchema = z.object({
  count: z.coerce.number().min(1).max(100).default(10),
});

export const getScreenshotsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z
    .enum(["createdAt", "updatedAt", "name", "type"])
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type AddTextScreenshotInput = z.infer<typeof addTextScreenshotSchema>;
export type AddExternalScreenshotInput = z.infer<
  typeof addExternalScreenshotSchema
>;
export type EditTextScreenshotInput = z.infer<typeof editTextScreenshotSchema>;
export type BulkDeleteScreenshotInput = z.infer<
  typeof bulkDeleteScreenshotSchema
>;
export type GetScreenshotsQueryInput = z.infer<
  typeof getScreenshotsQuerySchema
>;
