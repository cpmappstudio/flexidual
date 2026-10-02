import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

import { Toaster } from "@/components/ui/sonner";

let fullscreenElement: Element | null;

beforeEach(() => {
  fullscreenElement = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
});

afterEach(() => {
  cleanup();
  fullscreenElement = null;
});

describe("fullscreen toaster", () => {
  it("moves user feedback into the fullscreen surface", async () => {
    const fullscreenRoot = document.createElement("div");
    document.body.append(fullscreenRoot);
    render(<Toaster />);

    fullscreenElement = fullscreenRoot;
    document.dispatchEvent(new Event("fullscreenchange"));

    await waitFor(() => {
      expect(fullscreenRoot.contains(screen.getByTestId("toaster"))).toBe(true);
    });
  });

  it("returns user feedback to the document after leaving fullscreen", async () => {
    const fullscreenRoot = document.createElement("div");
    document.body.append(fullscreenRoot);
    fullscreenElement = fullscreenRoot;
    render(<Toaster />);

    await waitFor(() => {
      expect(fullscreenRoot.contains(screen.getByTestId("toaster"))).toBe(true);
    });

    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));

    await waitFor(() => {
      expect(document.body.contains(screen.getByTestId("toaster"))).toBe(true);
      expect(fullscreenRoot.contains(screen.getByTestId("toaster"))).toBe(
        false,
      );
    });
  });
});
