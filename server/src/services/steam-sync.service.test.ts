import { describe, it, expect, vi } from "vitest";

// ─── Hoisted mock helpers (vi.hoisted runs during module init before vi.mock) ─

const {
  externalAccountMock,
  libraryEntryMock,
  steamSyncConflictMock,
  userMock,
} = vi.hoisted(() => ({
  externalAccountMock: { findOne: vi.fn() },
  libraryEntryMock: {
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
  steamSyncConflictMock: {
    create: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    countDocuments: vi.fn(),
  },
  userMock: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock("../models/ExternalAccount", () => ({ default: externalAccountMock }));
vi.mock("../models/LibraryEntry", () => ({ default: libraryEntryMock }));
vi.mock("../models/SteamSyncConflict", () => ({
  default: steamSyncConflictMock,
}));
vi.mock("../models/User", () => ({ default: userMock }));
vi.mock("../services/steam.service", () => ({ fetchSteamLibrary: vi.fn() }));

import {
  checkSyncNeeded,
  markExcluded,
  resolveConflict,
  getSteamSyncStatus,
} from "../services/steam-sync.service";

// ─── Reset all mocks before each test ───────────────────────────────────────

function resetAllMocks() {
  const allMocks = [
    externalAccountMock,
    libraryEntryMock,
    steamSyncConflictMock,
    userMock,
  ];
  for (const mock of allMocks) {
    for (const fn of Object.values(mock)) {
      if (typeof fn.mockReset === "function") fn.mockReset();
    }
  }
  // Sensible defaults
  libraryEntryMock.findByIdAndUpdate.mockResolvedValue(null);
  libraryEntryMock.findOneAndUpdate.mockResolvedValue(null);
  userMock.findById.mockResolvedValue(null);
  steamSyncConflictMock.findOne.mockResolvedValue(null);
  steamSyncConflictMock.countDocuments.mockResolvedValue(0);
  steamSyncConflictMock.create.mockResolvedValue({});
  libraryEntryMock.findById.mockResolvedValue(null);
  libraryEntryMock.findOne.mockResolvedValue(null);
}

// ─── checkSyncNeeded ─────────────────────────────────────────────────────────

describe("steam-sync.service", () => {
  beforeEach(resetAllMocks);

  describe("checkSyncNeeded", () => {
    it("returns true if sync is disabled", () => {
      const user = {
        steamSyncSettings: {
          enabled: false,
          intervalHours: 24,
          lastSyncAt: new Date().toISOString(),
        },
      } as any;
      expect(checkSyncNeeded(user)).toBe(true);
    });

    it("returns true if never synced before", () => {
      const user = {
        steamSyncSettings: {
          enabled: true,
          intervalHours: 24,
          lastSyncAt: null,
        },
      } as any;
      expect(checkSyncNeeded(user)).toBe(true);
    });

    it("returns true if interval has elapsed", () => {
      const fiveHoursAgo = new Date(
        Date.now() - 5 * 60 * 60 * 1000,
      ).toISOString();
      const user = {
        steamSyncSettings: {
          enabled: true,
          intervalHours: 1,
          lastSyncAt: fiveHoursAgo,
        },
      } as any;
      expect(checkSyncNeeded(user)).toBe(true);
    });

    it("returns false if interval has NOT elapsed", () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const user = {
        steamSyncSettings: {
          enabled: true,
          intervalHours: 24,
          lastSyncAt: oneMinuteAgo,
        },
      } as any;
      expect(checkSyncNeeded(user)).toBe(false);
    });
  });

  // ─── markExcluded ────────────────────────────────────────────────────────

  describe("markExcluded", () => {
    it("marks entry as excluded and sets syncStatus to excluded", async () => {
      libraryEntryMock.findOneAndUpdate.mockResolvedValue({ _id: "entry1" });

      await markExcluded("entry1", "user1", true);

      expect(libraryEntryMock.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "entry1", user: "user1" },
        { $set: { steamSyncExclude: true, syncStatus: "excluded" } },
      );
    });

    it("marks entry as included and sets syncStatus to synced", async () => {
      libraryEntryMock.findOneAndUpdate.mockResolvedValue({ _id: "entry1" });

      await markExcluded("entry1", "user1", false);

      expect(libraryEntryMock.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "entry1", user: "user1" },
        { $set: { steamSyncExclude: false, syncStatus: "synced" } },
      );
    });

    it("resolves pending conflicts when excluding", async () => {
      libraryEntryMock.findOneAndUpdate.mockResolvedValueOnce({
        _id: "entry1",
      });
      steamSyncConflictMock.findOneAndUpdate.mockResolvedValueOnce({
        _id: "conflict1",
      });

      await markExcluded("entry1", "user1", true);

      // SteamSyncConflict.findOneAndUpdate should be called to resolve the conflict
      expect(steamSyncConflictMock.findOneAndUpdate).toHaveBeenCalledWith(
        { libraryEntryId: "entry1", status: "pending" },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "resolved",
            resolution: "ignore",
          }),
        }),
      );
    });

    it("does NOT resolve conflicts when un-excluding", async () => {
      libraryEntryMock.findOneAndUpdate.mockResolvedValue({ _id: "entry1" });

      await markExcluded("entry1", "user1", false);

      expect(libraryEntryMock.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });
  });

  // ─── resolveConflict ─────────────────────────────────────────────────────

  describe("resolveConflict", () => {
    it("returns early if conflict not found", async () => {
      steamSyncConflictMock.findOne.mockResolvedValue(null);

      await resolveConflict("conflict1", "user1", "take_steam");

      expect(libraryEntryMock.findById).not.toHaveBeenCalled();
    });

    it("returns early if library entry not found", async () => {
      steamSyncConflictMock.findOne.mockResolvedValue({
        _id: "conflict1",
        userId: "user1",
        libraryEntryId: "entry1",
        steamValue: 120,
        manualValue: 60,
      });
      libraryEntryMock.findById.mockResolvedValue(null);

      await resolveConflict("conflict1", "user1", "take_steam");

      expect(libraryEntryMock.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("take_steam: updates playTimeMinutes and sets manualPlayTime to false", async () => {
      const mockConflict = {
        _id: "conflict1",
        userId: "user1",
        libraryEntryId: "entry1",
        steamValue: 120,
        manualValue: 60,
        status: "pending",
        resolution: null,
        resolvedAt: null,
        save: vi.fn(),
      };
      steamSyncConflictMock.findOne.mockResolvedValue(mockConflict);
      libraryEntryMock.findById.mockResolvedValue({ _id: "entry1" });
      libraryEntryMock.findByIdAndUpdate.mockResolvedValue({ _id: "entry1" });

      await resolveConflict("conflict1", "user1", "take_steam");

      expect(libraryEntryMock.findByIdAndUpdate).toHaveBeenCalledWith(
        "entry1",
        {
          $set: {
            playTimeMinutes: 120,
            manualPlayTime: false,
            syncStatus: "resolved",
          },
        },
      );
      expect(mockConflict.save).toHaveBeenCalled();
    });

    it("keep_manual: only marks manualPlayTime true", async () => {
      const mockConflict = {
        _id: "conflict1",
        userId: "user1",
        libraryEntryId: "entry1",
        steamValue: 120,
        manualValue: 60,
        status: "pending",
        resolution: null,
        resolvedAt: null,
        save: vi.fn(),
      };
      steamSyncConflictMock.findOne.mockResolvedValue(mockConflict);
      libraryEntryMock.findById.mockResolvedValue({ _id: "entry1" });
      libraryEntryMock.findByIdAndUpdate.mockResolvedValue({ _id: "entry1" });

      await resolveConflict("conflict1", "user1", "keep_manual");

      expect(libraryEntryMock.findByIdAndUpdate).toHaveBeenCalledWith(
        "entry1",
        {
          $set: { manualPlayTime: true, syncStatus: "resolved" },
        },
      );
      expect(mockConflict.save).toHaveBeenCalled();
    });

    it("ignore: only updates syncStatus", async () => {
      const mockConflict = {
        _id: "conflict1",
        userId: "user1",
        libraryEntryId: "entry1",
        steamValue: 120,
        manualValue: 60,
        status: "pending",
        resolution: null,
        resolvedAt: null,
        save: vi.fn(),
      };
      steamSyncConflictMock.findOne.mockResolvedValue(mockConflict);
      libraryEntryMock.findById.mockResolvedValue({ _id: "entry1" });
      libraryEntryMock.findByIdAndUpdate.mockResolvedValue({ _id: "entry1" });

      await resolveConflict("conflict1", "user1", "ignore");

      expect(libraryEntryMock.findByIdAndUpdate).toHaveBeenCalledWith(
        "entry1",
        {
          $set: { syncStatus: "resolved" },
        },
      );
      expect(mockConflict.save).toHaveBeenCalled();
    });
  });

  // ─── getSteamSyncStatus ──────────────────────────────────────────────────

  describe("getSteamSyncStatus", () => {
    it("returns null if user not found", async () => {
      userMock.findById.mockResolvedValue(null);

      const result = await getSteamSyncStatus("user1");
      expect(result).toBeNull();
    });

    it("returns correct status fields", async () => {
      userMock.findById.mockResolvedValue({
        steamSyncSettings: {
          enabled: true,
          intervalHours: 12,
          lastSyncAt: "2026-04-27T10:00:00Z",
          lastSyncStatus: "success",
        },
      });
      steamSyncConflictMock.countDocuments.mockResolvedValue(3);

      const result = await getSteamSyncStatus("user1");

      expect(result).toEqual({
        enabled: true,
        intervalHours: 12,
        lastSyncAt: "2026-04-27T10:00:00Z",
        lastSyncStatus: "success",
        pendingConflicts: 3,
        lastError: null,
      });
    });

    it("uses defaults for missing settings fields", async () => {
      userMock.findById.mockResolvedValue({ steamSyncSettings: {} });
      steamSyncConflictMock.countDocuments.mockResolvedValue(0);

      const result = await getSteamSyncStatus("user1");

      expect(result?.enabled).toBe(false);
      expect(result?.intervalHours).toBe(24);
      expect(result?.lastSyncAt).toBeNull();
      expect(result?.lastSyncStatus).toBeNull();
    });
  });
});
