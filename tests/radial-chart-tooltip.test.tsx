import { cloneElement, type ReactElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RadialChart } from "@/components/ui/radial-chart";

// Keep the real shadcn chart/tooltip and Recharts; only provide layout for JSDOM.
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactNode }) =>
    cloneElement(children as ReactElement<{ width: number; height: number }>, {
      width: 44,
      height: 44,
    }),
}));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test.each([0, 0.58, 100])(
  "the entire %s percent ring shows a portaled chart tooltip on hover",
  async (value) => {
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <RadialChart
          value={value}
          label="Abeka"
          className="size-11"
          config={{ progress: { label: "Abeka", color: "#86338a" } }}
          center={<span>Logo</span>}
          tooltip={<div>{value}% · Last synced: Sep 25, 2026</div>}
        />
      </div>,
    );
    const trigger = screen.getByRole("img", {
      name: `Abeka: ${value}`,
    }).parentElement!;
    fireEvent.pointerMove(trigger, { pointerType: "mouse" });
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain(`${value}%`);
    expect(tooltip.textContent).toContain("Sep 25, 2026");
    expect(container.contains(tooltip)).toBe(false);
    expect(
      document.querySelector('[data-slot="tooltip-content"] .shadow-xl'),
    ).not.toBeNull();
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
  },
);

test("keyboard focus opens the tooltip and Escape dismisses it", async () => {
  render(
    <RadialChart
      value={0}
      label="Abeka"
      config={{}}
      tooltip={<span>Last synced: Sep 25</span>}
    />,
  );
  const trigger = screen.getByRole("img", { name: "Abeka: 0" }).parentElement!;
  expect(trigger.tabIndex).toBe(0);
  fireEvent.focus(trigger);
  expect((await screen.findByRole("tooltip")).textContent).toContain("Sep 25");
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("an actionable ring is a native dialog button and keeps its tooltip", async () => {
  const open = vi.fn();
  render(
    <RadialChart
      value={0.32}
      label="Abeka"
      ariaLabel="View progress · Abeka"
      config={{}}
      tooltip={<span>Abeka · 0.32%</span>}
      onClick={open}
    />,
  );
  const trigger = screen.getByRole("button", { name: "View progress · Abeka" });
  expect(trigger.getAttribute("type")).toBe("button");
  expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
  fireEvent.focus(trigger);
  expect((await screen.findByRole("tooltip")).textContent).toContain("0.32%");
  fireEvent.click(trigger);
  expect(open).toHaveBeenCalledTimes(1);
});
