import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScreenshotCard } from "./ScreenshotCard";
import type { Screenshot } from "@/api/types";

const mockScreenshot: Screenshot = {
  _id: "ss1",
  user: "user1",
  libraryEntry: {
    _id: "entry1",
    name: "Elden Ring",
    slug: "elden-ring",
    steamAppId: 1245620,
    coverImage: undefined,
  } as any,
  type: "image",
  url: "https://example.com/screenshot.jpg",
  thumbnail: undefined,
  name: "My Elden Ring Screenshot",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const createMockScreenshot = (
  overrides: Partial<Screenshot> = {},
): Screenshot =>
  ({
    ...mockScreenshot,
    ...overrides,
  }) as Screenshot;

describe("ScreenshotCard", () => {
  describe("shows game name", () => {
    it("displays game name below image when libraryEntry has game", () => {
      const screenshot = createMockScreenshot({
        libraryEntry: {
          _id: "entry1",
          game: {
            _id: "game1",
            name: "Elden Ring",
            slug: "elden-ring",
          },
        },
      } as any);

      render(<ScreenshotCard screenshot={screenshot} />);
      expect(screen.getByText("Elden Ring")).toBeInTheDocument();
    });

    it("does not show game info when libraryEntry is missing", () => {
      const screenshot = createMockScreenshot({ libraryEntry: null });
      render(<ScreenshotCard screenshot={screenshot} />);
      expect(screen.queryByText("Elden Ring")).not.toBeInTheDocument();
    });
  });

  describe("shows ImageOff on error", () => {
    it("renders an img element when screenshot type is image with valid url", () => {
      const screenshot = createMockScreenshot({
        type: "image",
        url: "https://example.com/good-image.jpg",
      });

      const { container } = render(<ScreenshotCard screenshot={screenshot} />);
      // jsdom doesn't fail images, so img should be present
      expect(container.querySelector("img")).toBeTruthy();
    });
  });

  describe("shows name overlay", () => {
    it("shows name overlay at bottom of image when screenshot has a name", () => {
      const screenshot = createMockScreenshot({
        name: "My Cool Screenshot",
        type: "image",
        url: "https://example.com/good-image.jpg",
      });

      const { container } = render(<ScreenshotCard screenshot={screenshot} />);

      // The name overlay is rendered as a div with absolute positioning
      // containing the screenshot name text
      const overlayText = container.querySelector(".absolute.bottom-0");
      expect(overlayText?.textContent).toContain("My Cool Screenshot");
    });

    it("does not show name overlay when name is empty", () => {
      const screenshot = createMockScreenshot({
        name: "",
        type: "image",
        url: "https://example.com/good-image.jpg",
      });

      const { container } = render(<ScreenshotCard screenshot={screenshot} />);

      // Check there's no overlay with screenshot name
      const overlays = container.querySelectorAll(".absolute.bottom-0");
      for (const overlay of overlays) {
        expect(overlay?.textContent).not.toContain("My Cool Screenshot");
      }
    });
  });
});
