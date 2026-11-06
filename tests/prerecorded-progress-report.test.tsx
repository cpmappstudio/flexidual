import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { PrerecordedProgressReport } from "@/components/recordings/prerecorded-progress-report";
import messages from "@/messages/en.json";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  loadMore: vi.fn(),
}));
vi.mock("convex/react", () => ({ usePaginatedQuery: mocks.query }));
const course = {
  classId: "course" as Id<"classes">,
  className: "Science",
  timeZone: "America/Tegucigalpa",
};
const row = (
  name: string,
  percentage: number | null,
  lastProgressAt: number | null = null,
) => ({
  videoId: name,
  name,
  percentage,
  lastProgressAt,
  scheduledStart: Date.UTC(2026, 10, 5, 18),
});
function view() {
  return render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <PrerecordedProgressReport
        course={course}
        studentId="learner"
        orgSlug="campus"
      />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  mocks.query.mockReset().mockReturnValue({
    results: [],
    status: "Exhausted",
    loadMore: mocks.loadMore,
  });
  mocks.loadMore.mockReset();
});
afterEach(() => cleanup());

test("loads only on opening, reuses Abeka percentage display and preserves partial/unknown progress", () => {
  mocks.query.mockReturnValue({
    results: [
      row("partial.mp4", 0.58, Date.UTC(2026, 10, 5, 19)),
      row("unknown.mp4", null),
      row("zero.mp4", 0),
    ],
    status: "Exhausted",
    loadMore: mocks.loadMore,
  });
  view();
  expect(mocks.query).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Prerecorded class progress · Science",
    }),
  );
  expect(mocks.query.mock.calls[0][1]).toEqual({
    classId: "course",
    studentId: "learner",
    orgSlug: "campus",
  });
  expect(mocks.query.mock.calls[0][2]).toEqual({ initialNumItems: 10 });
  expect(
    screen
      .getByRole("progressbar", { name: "partial.mp4: Watched" })
      .getAttribute("aria-valuenow"),
  ).toBe("0.58");
  expect(screen.getByText("0.58%")).toBeDefined();
  expect(
    screen.getByRole("columnheader", { name: "Last progress saved" }),
  ).toBeDefined();
  expect(screen.queryByText("Last activity")).toBeNull();
  expect(screen.getByText("Duration not verified")).toBeDefined();
  expect(screen.getAllByText(/12:00 PM/)).toHaveLength(3);
  expect(screen.getByText(/1:00 PM/)).toBeDefined();
  expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Watched" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("loads more explicitly and does not claim the first page is the whole course", () => {
  mocks.query.mockReturnValue({
    results: [row("first.mp4", 50)],
    status: "CanLoadMore",
    loadMore: mocks.loadMore,
  });
  view();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Prerecorded class progress · Science",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Load More" }));
  expect(mocks.loadMore).toHaveBeenCalledWith(10);
});

test.each(["LoadingFirstPage", "CanLoadMore", "Exhausted"])(
  "handles an empty %s without showing stale rows",
  (status) => {
    mocks.query.mockReturnValue({
      results: [],
      status,
      loadMore: mocks.loadMore,
    });
    view();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Prerecorded class progress · Science",
      }),
    );
    expect(
      Boolean(
        screen.queryByText(
          "There are no published prerecorded classes in this course yet.",
        ),
      ),
    ).toBe(status === "Exhausted");
    expect(mocks.loadMore).toHaveBeenCalledTimes(
      status === "CanLoadMore" ? 1 : 0,
    );
  },
);
