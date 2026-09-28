import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { RadialChart } from "@/components/ui/radial-chart";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    config: _config,
    ...props
  }: {
    children: ReactNode;
    config: unknown;
  }) => {
    void _config;
    return <div {...props}>{children}</div>;
  },
}));
vi.mock("recharts", () => ({
  RadialBarChart: ({
    children,
    endAngle,
    data,
  }: {
    children: ReactNode;
    endAngle: number;
    data: { progress: number }[];
  }) => (
    <svg
      data-testid="radial"
      data-end-angle={endAngle}
      data-progress={data[0].progress}
    >
      {children}
    </svg>
  ),
  RadialBar: ({ fill }: { fill: string }) => (
    <circle data-testid="bar" fill={fill} />
  ),
  PolarAngleAxis: () => null,
  PolarRadiusAxis: ({ children }: { children: ReactNode }) => <g>{children}</g>,
  Label: ({
    content,
  }: {
    content: (props: { viewBox: { cx: number; cy: number } }) => ReactNode;
  }) => content({ viewBox: { cx: 22, cy: 22 } }),
}));
afterEach(cleanup);

test("the existing course ring keeps its percentage and label", () => {
  render(
    <RadialChart
      value={67}
      label="Completed"
      config={{}}
      showPercentage
      className="size-32"
    />,
  );
  expect(screen.getByText("67%")).toBeTruthy();
  expect(screen.getByText("Completed")).toBeTruthy();
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "Completed: 67%",
  );
});

test("a compact Abeka ring replaces center text without changing the percentage arc", () => {
  render(
    <RadialChart
      value={50}
      label="Abeka"
      ariaLabel="Abeka: 50%"
      fill="#86338a"
      config={{}}
      className="size-11"
      center={<span data-testid="logo">Abeka</span>}
    />,
  );
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Abeka: 50%");
  expect(
    screen.getByRole("img").parentElement?.classList.contains("size-11"),
  ).toBe(true);
  expect(screen.getByTestId("radial").getAttribute("data-end-angle")).toBe(
    "-270",
  );
  expect(screen.getByTestId("radial").getAttribute("data-progress")).toBe("50");
  expect(screen.getByTestId("bar").getAttribute("fill")).toBe("#86338a");
  expect(
    screen.getByTestId("logo").parentElement?.getAttribute("aria-hidden"),
  ).toBe("true");
  expect(screen.queryByText("50%")).toBeNull();
});
