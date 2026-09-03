import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomActionBar } from "@/components/classroom/classroom-action-bar";

function mockViewport(isCompact: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: isCompact,
      media: "(max-width: 1023px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe("ClassroomActionBar", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mounts only the desktop control branch on wide screens", () => {
    mockViewport(false);

    render(
      <ClassroomActionBar
        mobile={<span>mobile controls</span>}
        left={<span>desktop left</span>}
        center={<span>desktop center</span>}
        right={<span>desktop right</span>}
      />,
    );

    expect(screen.queryByText("mobile controls")).toBeNull();
    expect(screen.getByText("desktop left")).toBeTruthy();
  });

  it("mounts only the compact control branch below the lg breakpoint", () => {
    mockViewport(true);

    render(
      <ClassroomActionBar
        mobile={<span>mobile controls</span>}
        left={<span>desktop left</span>}
        center={<span>desktop center</span>}
        right={<span>desktop right</span>}
      />,
    );

    expect(screen.getByText("mobile controls")).toBeTruthy();
    expect(screen.queryByText("desktop left")).toBeNull();
  });
});
