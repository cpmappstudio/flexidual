import { cloneElement, type ReactElement, type ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RadialChart } from "@/components/ui/radial-chart";

// Give real Recharts a fixed viewport; JSDOM cannot measure ResponsiveContainer.
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => (
    <div>
      {cloneElement(
        children as ReactElement<{ width: number; height: number }>,
        { width: 44, height: 44 },
      )}
    </div>
  ),
}));
afterEach(cleanup);

test.each([0, 0.58, 50, 100])(
  "real Recharts renders a circular track at %s percent without oversized SVG circles",
  (value) => {
    const { container } = render(
      <RadialChart
        value={value}
        label="Abeka"
        config={{}}
        fill="#86338a"
        className="size-11"
        center={<span>Abeka</span>}
      />,
    );
    const track = container.querySelector(
      ".recharts-radial-bar-background-sector",
    );
    expect(track?.tagName).toBe("path");
    expect(track?.getAttribute("d")).toContain("A");
    expect(track?.getAttribute("d")).not.toContain("NaN");
    expect(container.querySelector("circle[r$='%']")).toBeNull();
  },
);
