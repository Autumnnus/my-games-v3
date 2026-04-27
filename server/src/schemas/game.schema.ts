import { z } from "zod";
import type { IGDBData } from "@my-games/shared";

const platformEnum = z.enum([
  "steam",
  "epicGames",
  "ubisoft",
  "xboxPc",
  "eaGames",
  "torrent",
  "playstation",
  "xboxSeries",
  "nintendo",
  "mobile",
  "otherPlatforms",
]);

const statusEnum = z.enum([
  "completed",
  "abandoned",
  "toBeCompleted",
  "activePlaying",
]);

export const addGameSchema = z.object({
  name: z.string().min(1).max(200),
  photo: z.string().optional(),
  lastPlay: z.coerce.date().optional(),
  platform: platformEnum,
  review: z.string().optional(),
  rating: z.number().min(0).max(10).optional(),
  status: statusEnum,
  playTime: z.number().min(0),
  firstFinished: z.coerce.date().optional(),
  isFavorite: z.boolean().default(false),
  igdb: z.custom<IGDBData>().optional(),
  steamAppId: z.number().int().positive().optional(),
});

export const editGameSchema = addGameSchema.partial();

export const getUserGamesQuerySchema = z.object({
  sortBy: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
  status: statusEnum.optional(),
  platform: platformEnum.optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
});

export type AddGameInput = z.infer<typeof addGameSchema>;
export type EditGameInput = z.infer<typeof editGameSchema>;
export type GetUserGamesQueryInput = z.infer<typeof getUserGamesQuerySchema>;
