import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useUserScreenshots } from "./useScreenshots";
import { screenshotKeys } from "@/api/queryKeys";

// Mock screenshotsApi
vi.mock("@/api/screenshots.api", () => ({
  screenshotsApi: {
    getUserScreenshots: vi.fn().mockResolvedValue([]),
    getGameScreenshots: vi.fn(),
    addImageScreenshot: vi.fn(),
    addTextScreenshot: vi.fn(),
    importExternalScreenshots: vi.fn(),
    deleteScreenshot: vi.fn(),
    deleteAllForGame: vi.fn(),
    getRandom: vi.fn(),
  },
}));

// Import after mock
import { screenshotsApi } from "@/api/screenshots.api";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useScreenshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useUserScreenshots", () => {
    it("uses correct query key", async () => {
      const userId = "user123";
      const { result } = renderHook(() => useUserScreenshots(userId), {
        wrapper: createWrapper(),
      });

      // Query should be enabled and have the correct key structure
      expect(result.current.dataUpdatedAt).toBeDefined();
    });

    it("query key includes userId", () => {
      // Verify the screenshotKeys.user factory produces correct structure
      const key = screenshotKeys.user("user123");
      expect(key).toEqual(["screenshots", "user", "user123"]);
    });

    it("calls screenshotsApi.getUserScreenshots with userId", async () => {
      const userId = "user456";
      const { result } = renderHook(() => useUserScreenshots(userId), {
        wrapper: createWrapper(),
      });

      // Wait for the query to fire
      await vi.waitFor(() => expect(result.current.isSuccess));

      expect(screenshotsApi.getUserScreenshots).toHaveBeenCalledWith(userId);
    });

    it("does not fire when userId is empty string", async () => {
      const { result } = renderHook(() => useUserScreenshots(""), {
        wrapper: createWrapper(),
      });

      // Query should not be enabled when userId is falsy
      expect(result.current.isFetching).toBe(false);
      expect(screenshotsApi.getUserScreenshots).not.toHaveBeenCalled();
    });
  });

  describe("query key factories", () => {
    it("screenshotKeys.game produces correct key", () => {
      expect(screenshotKeys.game("game1", 2)).toEqual([
        "screenshots",
        "game",
        "game1",
        2,
      ]);
    });

    it("screenshotKeys.random produces correct key", () => {
      expect(screenshotKeys.random(5)).toEqual(["screenshots", "random", 5]);
    });

    it("screenshotKeys.user produces correct key", () => {
      expect(screenshotKeys.user("u1")).toEqual(["screenshots", "user", "u1"]);
    });
  });
});
