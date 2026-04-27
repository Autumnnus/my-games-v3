import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before importing the service
vi.mock("../lib/upload", () => ({
  deleteFromR2: vi.fn().mockResolvedValue(undefined),
  updateInR2: vi
    .fn()
    .mockResolvedValue({
      url: "https://r2.example.com/updated.jpg",
      key: "updated-key",
    }),
  uploadToR2: vi.fn(),
  uploadToR2Structured: vi
    .fn()
    .mockResolvedValue({
      url: "https://r2.example.com/uploaded.jpg",
      key: "upload-key",
    }),
}));

vi.mock("../services/activity.service", () => ({
  default: { log: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../services/notification.service", () => ({
  notifyScreenshotAdded: vi.fn().mockResolvedValue(undefined),
}));

const mockFind = vi.fn();
const mockDeleteMany = vi.fn();
const mockUserFindById = vi.fn();
const mockLibraryEntryFindById = vi.fn();

vi.mock("../models/Screenshot", () => ({
  default: class MockScreenshot {
    static find = (...args: unknown[]) => mockFind(...args);
    static create = vi
      .fn()
      .mockImplementation((data) => ({
        ...data,
        _id: `mock_screenshot_${Date.now()}`,
      }));
    static deleteMany = (...args: unknown[]) => mockDeleteMany(...args);
  },
}));

vi.mock("../models/LibraryEntry", () => ({
  default: class MockLibraryEntry {
    static findById = (...args: unknown[]) => mockLibraryEntryFindById(...args);
  },
}));

vi.mock("../models/User", () => ({
  default: class MockUser {
    static findById = (...args: unknown[]) => mockUserFindById(...args);
  },
}));

import screenshotService from "../services/screenshot.service";

describe("screenshot.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return null for missing entities
    mockUserFindById.mockResolvedValue(null);
    mockLibraryEntryFindById.mockResolvedValue(null);
    mockFind.mockResolvedValue([]);
  });

  // ─── bulkDeleteScreenshotService ─────────────────────────────────────────

  describe("bulkDeleteScreenshotService", () => {
    it("throws NOT_FOUND if user does not exist", async () => {
      mockUserFindById.mockResolvedValue(null);

      await expect(
        screenshotService.bulkDeleteScreenshotService({
          userId: "user1",
          gameId: "game1",
          screenshotIds: ["ss1"],
        }),
      ).rejects.toThrow("User not found");
    });

    it("throws NOT_FOUND if library entry does not exist", async () => {
      mockUserFindById.mockResolvedValue({ _id: "user1", role: "user" } as any);
      mockLibraryEntryFindById.mockResolvedValue(null);

      await expect(
        screenshotService.bulkDeleteScreenshotService({
          userId: "user1",
          gameId: "game1",
          screenshotIds: ["ss1"],
        }),
      ).rejects.toThrow("Library entry not found");
    });

    it("throws NOT_FOUND if no screenshots match user/game ownership", async () => {
      mockUserFindById.mockResolvedValue({ _id: "user1", role: "user" } as any);
      mockLibraryEntryFindById.mockResolvedValue({ _id: "game1" } as any);
      mockFind.mockResolvedValue([]);

      await expect(
        screenshotService.bulkDeleteScreenshotService({
          userId: "user1",
          gameId: "game1",
          screenshotIds: ["ss1"],
        }),
      ).rejects.toThrow("No matching screenshots found for bulk delete");
    });

    it("throws BAD_REQUEST if some screenshot IDs are invalid or not owned", async () => {
      mockUserFindById.mockResolvedValue({ _id: "user1", role: "user" } as any);
      mockLibraryEntryFindById.mockResolvedValue({ _id: "game1" } as any);
      mockFind.mockResolvedValue([
        { _id: { toString: () => "ss1" }, key: null },
      ]);

      await expect(
        screenshotService.bulkDeleteScreenshotService({
          userId: "user1",
          gameId: "game1",
          screenshotIds: ["ss1", "ss2"],
        }),
      ).rejects.toThrow("Some screenshot ids are invalid or not owned");
    });

    it("deletes screenshots and returns deletedCount", async () => {
      mockUserFindById.mockResolvedValue({ _id: "user1", role: "user" } as any);
      mockLibraryEntryFindById.mockResolvedValue({ _id: "game1" } as any);
      mockFind.mockResolvedValue([
        { _id: { toString: () => "ss1" }, key: "key1" },
        { _id: { toString: () => "ss2" }, key: null },
      ]);
      mockDeleteMany.mockResolvedValue({ deletedCount: 2 } as any);

      const result = await screenshotService.bulkDeleteScreenshotService({
        userId: "user1",
        gameId: "game1",
        screenshotIds: ["ss1", "ss2"],
      });

      expect(result.deletedCount).toBe(2);
      expect(mockDeleteMany).toHaveBeenCalled();
    });
  });

  // ─── deleteAllScreenshotsForGameService ──────────────────────────────────

  describe("deleteAllScreenshotsForGameService", () => {
    it("throws NOT_FOUND if user does not exist", async () => {
      mockUserFindById.mockResolvedValue(null);

      await expect(
        screenshotService.deleteAllScreenshotsForGameService({
          userId: "user1",
          gameId: "game1",
        }),
      ).rejects.toThrow("User not found");
    });

    it("throws NOT_FOUND if library entry does not exist", async () => {
      mockUserFindById.mockResolvedValue({ _id: "user1" } as any);
      mockLibraryEntryFindById.mockResolvedValue(null);

      await expect(
        screenshotService.deleteAllScreenshotsForGameService({
          userId: "user1",
          gameId: "game1",
        }),
      ).rejects.toThrow("Library entry not found");
    });

    it("deletes all screenshots for a game", async () => {
      mockUserFindById.mockResolvedValue({ _id: "user1" } as any);
      mockLibraryEntryFindById.mockResolvedValue({ _id: "game1" } as any);
      mockFind.mockResolvedValue([
        { _id: { toString: () => "ss1" }, key: "key1" },
        { _id: { toString: () => "ss2" }, key: "key2" },
      ]);
      mockDeleteMany.mockResolvedValue({ deletedCount: 2 } as any);

      const result = await screenshotService.deleteAllScreenshotsForGameService(
        {
          userId: "user1",
          gameId: "game1",
        },
      );

      expect(result.deletedCount).toBe(2);
    });
  });
});
