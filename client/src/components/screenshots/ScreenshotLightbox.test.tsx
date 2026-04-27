import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScreenshotLightbox } from "./ScreenshotLightbox";
import type { Screenshot } from "@/api/types";

const mockScreenshot: Screenshot = {
  _id: "ss1",
  user: "user1",
  libraryEntry: {
    _id: "entry1",
    name: "Elden Ring",
    slug: "elden-ring",
  } as any,
  type: "image",
  url: "https://example.com/screenshot.jpg",
  name: "Test Screenshot",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const createMockScreenshots = (count: number): Screenshot[] =>
  Array.from({ length: count }, (_, i) => ({
    ...mockScreenshot,
    _id: `ss${i}`,
    libraryEntry: {
      _id: `entry${i}`,
      name: `Game ${i}`,
      slug: `game-${i}`,
    } as any,
  }));

describe("ScreenshotLightbox", () => {
  describe("shows game info", () => {
    it("displays game name when screenshot has libraryEntry with game", () => {
      const screenshots = createMockScreenshots(1);
      render(
        <ScreenshotLightbox
          screenshots={screenshots}
          index={0}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );

      expect(screen.getByText("Game 0")).toBeInTheDocument();
    });

    it("does not show game info when libraryEntry is missing", () => {
      const screenshots: Screenshot[] = [
        {
          ...mockScreenshot,
          libraryEntry: null,
        },
      ];

      render(
        <ScreenshotLightbox
          screenshots={screenshots}
          index={0}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );

      // No game name text should appear
      expect(screen.queryByText("Game 0")).not.toBeInTheDocument();
    });

    it('displays counter "1 / N"', () => {
      const screenshots = createMockScreenshots(5);
      render(
        <ScreenshotLightbox
          screenshots={screenshots}
          index={2}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );

      expect(screen.getByText("3 / 5")).toBeInTheDocument();
    });
  });

  describe("navigate button", () => {
    it("renders prev and next navigation buttons", () => {
      const screenshots = createMockScreenshots(3);
      render(
        <ScreenshotLightbox
          screenshots={screenshots}
          index={1}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );

      // Look for prev (should not be disabled at index 1) and next buttons
      const buttons = screen.getAllByRole("button");
      const prevButton = buttons.find(
        (b) => b.getAttribute("aria-label") === "Önceki",
      );
      const nextButton = buttons.find(
        (b) => b.getAttribute("aria-label") === "Sonraki",
      );

      expect(prevButton).toBeTruthy();
      expect(nextButton).toBeTruthy();
    });

    it("calls onNavigate when next button is clicked", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      const screenshots = createMockScreenshots(3);

      render(
        <ScreenshotLightbox
          screenshots={screenshots}
          index={0}
          onClose={vi.fn()}
          onNavigate={onNavigate}
        />,
      );

      const nextButton = screen.getByRole("button", { name: "Sonraki" });
      await user.click(nextButton);

      expect(onNavigate).toHaveBeenCalledWith(1);
    });

    it("calls onNavigate when prev button is clicked", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      const screenshots = createMockScreenshots(3);

      render(
        <ScreenshotLightbox
          screenshots={screenshots}
          index={1}
          onClose={vi.fn()}
          onNavigate={onNavigate}
        />,
      );

      const prevButton = screen.getByRole("button", { name: "Önceki" });
      await user.click(prevButton);

      expect(onNavigate).toHaveBeenCalledWith(0);
    });

    it("disables prev button when at first index", () => {
      const screenshots = createMockScreenshots(3);
      render(
        <ScreenshotLightbox
          screenshots={screenshots}
          index={0}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );

      const prevButton = screen.getByRole("button", { name: "Önceki" });
      expect(prevButton).toBeDisabled();
    });

    it("disables next button when at last index", () => {
      const screenshots = createMockScreenshots(3);
      render(
        <ScreenshotLightbox
          screenshots={screenshots}
          index={2}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      );

      const nextButton = screen.getByRole("button", { name: "Sonraki" });
      expect(nextButton).toBeDisabled();
    });
  });
});
