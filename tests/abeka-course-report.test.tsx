import {
  cloneElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { AbekaCourseReport } from "@/components/abeka/abeka-course-report";
import messages from "@/messages/en.json";

// Exercise real Recharts/shadcn behavior; JSDOM only needs a measured container.
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactNode }) =>
    cloneElement(children as ReactElement<{ width: number; height: number }>, {
      width: 128,
      height: 36,
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

test.each([true, false])(
  "the shared report supports collapsible=%s and retains partial lesson progress",
  (collapsible) => {
    const { container } = render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <AbekaCourseReport
          collapsible={collapsible}
          timeZone="America/Bogota"
          report={{
            subjectName: "Pre-Algebra",
            syncedAt: Date.parse("2026-09-25T05:29:00Z"),
            lessons: [
              {
                lessonNumber: 9,
                percentage: 54,
                completed: false,
                lastViewed: "2026-09-17",
              },
            ],
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(container.firstElementChild?.className).toContain("min-w-0");
    if (collapsible) expect(container.querySelector("details")).not.toBeNull();
    else {
      expect(container.querySelector("details")).toBeNull();
      expect(
        screen.getByRole("heading", { name: /Pre-Algebra/ }),
      ).toBeDefined();
      expect(container.firstElementChild?.className).not.toContain("border");
    }
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByText("Pre-Algebra")).toBeDefined();
    expect(screen.getByText("54%")).toBeDefined();
    expect(screen.getByText("Sep 17, 2026")).toBeDefined();
    expect(screen.getByText(/0 of 1/)).toBeDefined();
    expect(screen.getByText(/12:29/)).toBeDefined();
  },
);

function renderLessons(
  lessons: ComponentProps<typeof AbekaCourseReport>["report"]["lessons"],
) {
  return render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AbekaCourseReport
        collapsible={false}
        timeZone="America/Bogota"
        report={{ subjectName: "Science 8", syncedAt: 0, lessons }}
      />
    </NextIntlClientProvider>,
  );
}

function visibleLessons() {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

test("sorts numeric lessons, exact progress and calendar dates without mutating the report", () => {
  const lessons = [
    {
      lessonNumber: 10,
      percentage: 54,
      completed: false,
      lastViewed: "2026-09-17",
    },
    { lessonNumber: 2, percentage: 0.58, completed: false, lastViewed: null },
    {
      lessonNumber: 1,
      percentage: 100,
      completed: true,
      lastViewed: "2026-10-01",
    },
  ];
  const original = structuredClone(lessons);
  renderLessons(lessons);

  expect(visibleLessons()).toEqual(["1", "2", "10"]);
  expect(screen.getByText("0.58%")).toBeDefined();
  expect(
    screen
      .getByRole("progressbar", { name: "Lesson 2: Watched" })
      .getAttribute("aria-valuenow"),
  ).toBe("0.58");
  expect(
    screen.getByRole("img", { name: "Lesson completed" }).closest("td")
      ?.textContent,
  ).toBe("1");
  expect(screen.getByText(/1 of 3 completed/)).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Lesson" }));
  expect(visibleLessons()).toEqual(["10", "2", "1"]);
  fireEvent.click(screen.getByRole("button", { name: "Watched" }));
  expect(visibleLessons()).toEqual(["2", "10", "1"]);
  fireEvent.click(screen.getByRole("button", { name: "Watched" }));
  expect(visibleLessons()).toEqual(["1", "10", "2"]);
  fireEvent.click(screen.getByRole("button", { name: "Last viewed" }));
  expect(visibleLessons()).toEqual(["10", "1", "2"]);
  fireEvent.click(screen.getByRole("button", { name: "Last viewed" }));
  expect(visibleLessons()).toEqual(["1", "10", "2"]);
  expect(screen.getByText("Oct 1, 2026")).toBeDefined();
  expect(lessons).toEqual(original);
});

test("progress colors reflect the value without inferring Abeka completion", () => {
  const values = [0, 49.99, 50, 99.99, 100];
  renderLessons(
    values.map((percentage, index) => ({
      lessonNumber: index + 1,
      percentage,
      completed: false,
      lastViewed: null,
    })),
  );
  const colors = [
    "bg-amber-500",
    "bg-amber-500",
    "bg-primary",
    "bg-primary",
    "bg-green-600",
  ];
  screen.getAllByRole("progressbar").forEach((bar, index) => {
    expect(bar.firstElementChild?.className).toContain(colors[index]);
    expect(bar.getAttribute("aria-valuenow")).toBe(String(values[index]));
    expect(bar.parentElement?.className).toContain("gap-1.5");
  });
  expect(screen.queryByRole("img", { name: "Lesson completed" })).toBeNull();
});

test("paginates long reports and sorts all lessons, not just the visible page", () => {
  renderLessons(
    Array.from({ length: 21 }, (_, index) => ({
      lessonNumber: index + 1,
      percentage: index + 1,
      completed: false,
      lastViewed: null,
    })),
  );

  expect(visibleLessons()).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Watched" }));
  fireEvent.click(screen.getByRole("button", { name: "Watched" }));
  expect(visibleLessons()).toEqual([
    "21",
    "20",
    "19",
    "18",
    "17",
    "16",
    "15",
    "14",
    "13",
    "12",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(visibleLessons()).toEqual([
    "11",
    "10",
    "9",
    "8",
    "7",
    "6",
    "5",
    "4",
    "3",
    "2",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(visibleLessons()).toEqual(["1"]);
  expect(
    screen
      .getByRole("button", { name: "Go to next page" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

test.each([1, 2])(
  "the trend shows real observed days with sub-percent precision (%s points)",
  (count) => {
    render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <AbekaCourseReport
          collapsible={false}
          report={{
            subjectName: "Science 8",
            syncedAt: 0,
            lessons: [],
            history: [
              { date: "2026-10-10", percentage: 0.0012 },
              { date: "2026-10-12", percentage: 0.0000013 },
            ].slice(0, count),
          }}
        />
      </NextIntlClientProvider>,
    );
    const trend = screen.getByRole("figure", { name: "Daily progress" });
    expect(within(trend).getByText("Oct 10, 2026: 0.0012%")).toBeDefined();
    expect(within(trend).queryByText(/Oct 11/)).toBeNull();
    if (count === 2)
      expect(within(trend).getByText("Oct 12, 2026: 0.0000013%")).toBeDefined();
    expect(within(trend).getAllByRole("listitem")).toHaveLength(count);
    expect(screen.queryByText("History starts with the next sync")).toBeNull();
  },
);

test("old reports do not fabricate historical activity", () => {
  renderLessons([]);
  expect(screen.getByText("History starts with the next sync")).toBeDefined();
  expect(screen.queryByRole("list")).toBeNull();
});

test("the chart tooltip escapes the report and follows keyboard-selected days precisely", async () => {
  const { container } = render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AbekaCourseReport
        collapsible={false}
        report={{
          subjectName: "Science 8",
          syncedAt: 0,
          lessons: [],
          history: [
            { date: "2026-10-10", percentage: 0.0012 },
            { date: "2026-10-12", percentage: 0.0000013 },
          ],
        }}
      />
    </NextIntlClientProvider>,
  );
  const chart = screen.getByRole("application");
  fireEvent.focus(chart);
  const tooltip = await screen.findByRole("tooltip");
  expect(container.contains(tooltip)).toBe(false);
  expect(within(tooltip).getByText("Oct 10, 2026")).toBeDefined();
  fireEvent.keyDown(chart, { key: "ArrowRight" });
  expect(await within(tooltip).findByText("Oct 12, 2026")).toBeDefined();
  expect(within(tooltip).getByText("0.0000013%")).toBeDefined();
  expect(screen.queryByText("NaN")).toBeNull();
  fireEvent.keyDown(chart, { key: "ArrowLeft" });
  expect(await within(tooltip).findByText("0.0012%")).toBeDefined();
  fireEvent.keyDown(chart, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.pointerLeave(chart, { pointerType: "mouse" });
  fireEvent.pointerMove(chart, { pointerType: "mouse" });
  expect((await screen.findByRole("tooltip")).textContent).toContain("0.0012%");
});
