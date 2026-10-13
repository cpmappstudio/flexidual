import type { ComponentProps } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { AbekaCourseReport } from "@/components/abeka/abeka-course-report";
import messages from "@/messages/en.json";

afterEach(cleanup);

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
  expect(screen.getByRole("img", { name: "Lesson completed" })).toBeDefined();
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
