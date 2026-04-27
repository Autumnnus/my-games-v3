import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies
vi.mock("../lib/upload", () => ({
  uploadToR2Structured: vi
    .fn()
    .mockResolvedValue({
      url: "https://r2.example.com/test.jpg",
      key: "test-key",
    }),
  uploadToR2Direct: vi
    .fn()
    .mockResolvedValue({
      url: "https://r2.example.com/direct.jpg",
      key: "direct-key",
    }),
}));

vi.mock("../config/env", () => ({
  env: { R2_BUCKET: "test-bucket", R2_PUBLIC_URL: "https://r2.example.com" },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: vi.fn(),
}));

vi.mock("../config/r2", () => ({
  r2: { send: vi.fn() },
}));

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn().mockReturnValue([]),
    json_to_sheet: vi.fn(),
    book_new: vi.fn(),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn(),
}));

const mockGameFindOne = vi.fn();
const mockGameFind = vi.fn();
const mockLibraryEntryFindOne = vi.fn();
const mockLibraryEntryFind = vi.fn();
const mockLibraryEntryCreate = vi.fn();

vi.mock("../models/Game", () => ({
  default: class MockGame {
    static findOne = (...args: unknown[]) => mockGameFindOne(...args);
    static find = (...args: unknown[]) => mockGameFind(...args);
  },
}));

vi.mock("../models/LibraryEntry", () => ({
  default: class MockLibraryEntry {
    static find = (...args: unknown[]) => mockLibraryEntryFind(...args);
    static findOne = (...args: unknown[]) => mockLibraryEntryFindOne(...args);
    static create = (...args: unknown[]) => mockLibraryEntryCreate(...args);
  },
}));

import {
  detectPreset,
  getPresetMapping,
  applyColumnMapping,
  resolveConflicts,
} from "./import-export.service";

describe("import-export.service", () => {
  // ─── detectPreset ─────────────────────────────────────────────────────────

  describe("detectPreset", () => {
    it("returns manual for empty rows", () => {
      expect(detectPreset([])).toEqual(["manual"]);
    });

    it("detects steam preset when appid + hours columns present", () => {
      const rows = [{ appid: 12345, hours_played: 10.5 }];
      const result = detectPreset(rows);
      expect(result).toContain("steam");
    });

    it("detects steam with steam_app_id column", () => {
      const rows = [{ steam_app_id: 12345, hours: 5 }];
      const result = detectPreset(rows);
      expect(result).toContain("steam");
    });

    it("detects psn preset when title + trophy columns present", () => {
      const rows = [{ title: "Game Name", trophy_count: 20 }];
      const result = detectPreset(rows);
      expect(result).toContain("psn");
    });

    it("detects psn with progress column", () => {
      const rows = [{ title: "Game", progress: "100%" }];
      const result = detectPreset(rows);
      expect(result).toContain("psn");
    });

    it("detects retroachievements with game_id column", () => {
      const rows = [{ game_id: 123, achievements: 50 }];
      const result = detectPreset(rows);
      expect(result).toContain("retroachievements");
    });

    it("always includes manual as fallback", () => {
      const rows = [{ name: "My Game", status: "backlog" }];
      const result = detectPreset(rows);
      expect(result).toContain("manual");
    });

    it("returns multiple matching presets", () => {
      const rows = [{ title: "Game", appid: 123, hours: 10 }];
      const result = detectPreset(rows);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── getPresetMapping ─────────────────────────────────────────────────────

  describe("getPresetMapping", () => {
    it("steam: maps hours/hours_played/play_time_hours to playTime", () => {
      const mapping = getPresetMapping("steam");
      expect(mapping["hours"]).toBe("playTime");
      expect(mapping["hours_played"]).toBe("playTime");
      expect(mapping["play_time_hours"]).toBe("playTime");
    });

    it("steam: maps appid/steam_app_id to steamAppId", () => {
      const mapping = getPresetMapping("steam");
      expect(mapping["appid"]).toBe("steamAppId");
      expect(mapping["steam_app_id"]).toBe("steamAppId");
    });

    it("steam: maps name", () => {
      const mapping = getPresetMapping("steam");
      expect(mapping["name"]).toBe("name");
    });

    it("psn: maps title to name", () => {
      const mapping = getPresetMapping("psn");
      expect(mapping["title"]).toBe("name");
    });

    it("psn: maps console/platform to platforms", () => {
      const mapping = getPresetMapping("psn");
      expect(mapping["console"]).toBe("platforms");
      expect(mapping["platform"]).toBe("platforms");
    });

    it("retroachievements: maps game_title to name", () => {
      const mapping = getPresetMapping("retroachievements");
      expect(mapping["game_title"]).toBe("name");
    });

    it("manual: returns empty mapping", () => {
      expect(getPresetMapping("manual")).toEqual({});
    });
  });

  // ─── applyColumnMapping ───────────────────────────────────────────────────

  describe("applyColumnMapping", () => {
    it("maps name correctly", () => {
      const rows = [{ GameName: "Elden Ring" }];
      const mapping = { GameName: "name" };
      const result = applyColumnMapping(rows, mapping);
      expect(result[0].name).toBe("Elden Ring");
    });

    it("maps status with normalization", () => {
      const rows = [{ Status: "backlog" }, { Status: "Completed" }];
      const mapping = { Status: "status" };
      const result = applyColumnMapping(rows, mapping);
      expect(result[0].status).toBe("toBeCompleted");
      expect(result[1].status).toBe("completed");
    });

    it("maps rating within 0-10 range", () => {
      const rows = [{ rating: "9.5" }, { rating: "-1" }, { rating: "11" }];
      const mapping = { rating: "rating" };
      const result = applyColumnMapping(rows, mapping);
      // 9.5 * 2 = 19, round = 19, / 2 = 9.5
      expect(result[0].rating).toBe(9.5);
      expect(result[1].rating).toBe(0);
      expect(result[2].rating).toBe(10);
    });

    it("maps playTime from hours columns to minutes", () => {
      const rows = [{ hours: "2.5" }, { playtime: "3" }];
      const mapping = { hours: "playTime", playtime: "playTime" };
      const result = applyColumnMapping(rows, mapping);
      expect(result[0].playTimeMinutes).toBe(150);
      expect(result[1].playTimeMinutes).toBe(3);
    });

    it("maps platforms as string array", () => {
      const rows = [
        { platform: "PC, Steam" },
        { platform: "PlayStation | Nintendo" },
      ];
      const mapping = { platform: "platforms" };
      const result = applyColumnMapping(rows, mapping);
      expect(result[0].platforms).toEqual(["PC", "Steam"]);
      expect(result[1].platforms).toEqual(["PlayStation", "Nintendo"]);
    });

    it("maps steamAppId as integer", () => {
      const rows = [{ appid: "12345" }, { appid: "not-a-number" }];
      const mapping = { appid: "steamAppId" };
      const result = applyColumnMapping(rows, mapping);
      expect(result[0].steamAppId).toBe(12345);
      expect(result[1].steamAppId).toBeUndefined();
    });

    it("skips rows with empty values", () => {
      const rows = [{ name: "", status: "backlog" }];
      const mapping = { name: "name", status: "status" };
      const result = applyColumnMapping(rows, mapping);
      expect(result[0].name).toBe("");
    });

    it("skips targetField ignore", () => {
      const rows = [{ somecol: "value" }];
      const mapping = { somecol: "ignore" };
      const result = applyColumnMapping(rows, mapping);
      expect(result[0]).not.toHaveProperty("somecol");
    });
  });

  // ─── resolveConflicts ─────────────────────────────────────────────────────

  describe("resolveConflicts", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("adds game when no existing entry found", async () => {
      vi.mocked(mockGameFindOne).mockResolvedValue(null);

      const games = [{ name: "NewGame" }];
      const result = await resolveConflicts(games, "skip", "user1");

      expect(result.toAdd).toHaveLength(1);
      expect(result.toUpdate).toHaveLength(0);
      expect(result.skipped).toBe(0);
    });

    it("skips when strategy is skip and entry exists", async () => {
      vi.mocked(mockGameFindOne).mockResolvedValue({
        _id: "game1",
        title: "ExistingGame",
      } as any);
      vi.mocked(mockLibraryEntryFindOne).mockResolvedValue({
        _id: "entry1",
      } as any);

      const games = [{ name: "ExistingGame" }];
      const result = await resolveConflicts(games, "skip", "user1");

      expect(result.skipped).toBe(1);
      expect(result.toAdd).toHaveLength(0);
    });

    it("updates when strategy is update and entry exists", async () => {
      vi.mocked(mockGameFindOne).mockResolvedValue({
        _id: "game1",
        title: "ExistingGame",
      } as any);
      vi.mocked(mockLibraryEntryFindOne).mockResolvedValue({
        _id: "entry1",
      } as any);

      const games = [{ name: "ExistingGame" }];
      const result = await resolveConflicts(games, "update", "user1");

      expect(result.toUpdate).toHaveLength(1);
      expect(result.skipped).toBe(0);
    });

    it("duplicates when strategy is duplicate", async () => {
      vi.mocked(mockGameFindOne).mockResolvedValue({
        _id: "game1",
        title: "ExistingGame",
      } as any);
      vi.mocked(mockLibraryEntryFindOne).mockResolvedValue({
        _id: "entry1",
      } as any);

      const games = [{ name: "ExistingGame" }];
      const result = await resolveConflicts(games, "duplicate", "user1");

      expect(result.toAdd).toHaveLength(1);
    });

    it("skips games with no name", async () => {
      vi.mocked(mockGameFindOne).mockResolvedValue(null);

      const games = [{ name: "" }];
      const result = await resolveConflicts(games, "skip", "user1");

      // Empty name is skipped (continues without adding or counting as conflict)
      expect(result.toAdd).toHaveLength(0);
    });
  });
});
