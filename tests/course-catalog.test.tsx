import { act, cleanup, render, screen, within } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { CourseCatalog } from "@/components/catalog/course-catalog";

const queries = vi.hoisted(() => vi.fn());
const access = vi.hoisted(() => ({ canViewPrivateCourses: true }));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/components/teaching/curriculums/curriculum-icon", () => ({
  CurriculumIcon: () => <span />,
}));
vi.mock("@/components/ui/responsive-filters", () => ({
  ResponsiveFilters: () => null,
}));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ScrollBar: () => null,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => ({
    canViewPrivateCourses: access.canViewPrivateCourses,
    campuses: [],
    curriculums: [],
    teachers: [],
  }),
  usePaginatedQuery: (
    query: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => queries(getFunctionName(query), args),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  queries.mockReset();
  access.canViewPrivateCourses = true;
});

test("non-managers request public and assigned courses; cards only link to authorized destinations", () => {
  access.canViewPrivateCourses = false;
  const course = {
    _id: "public",
    name: "Public course",
    curriculumTitle: "Curriculum",
    curriculumColor: "#197db8",
    accessMode: "school",
    canViewDetails: false,
  };
  queries.mockImplementation((name: string) => ({
    results:
      name === "classes:listCurrentCatalog"
        ? [
            {
              ...course,
              currentSession: {
                title: course.name,
                start: Date.now(),
                timeZone: "UTC",
                roomName: "public-room",
                canOpen: true,
                isLive: false,
              },
            },
          ]
        : [
            course,
            {
              ...course,
              _id: "own",
              name: "Own private course",
              accessMode: "private",
              canViewDetails: true,
            },
          ],
    status: "Exhausted",
    loadMore: vi.fn(),
  }));
  render(<CourseCatalog />);
  expect(queries.mock.calls.every(([, args]) => !("visibility" in args))).toBe(
    true,
  );
  const allCourses = screen.getByRole("region", { name: "catalog.allCourses" });
  expect(within(allCourses).getAllByRole("link")).toHaveLength(1);
  expect(within(allCourses).getByRole("link").getAttribute("href")).toBe(
    "/campus/classes/own",
  );
  expect(
    within(allCourses)
      .getByRole("heading", { name: "Public course" })
      .closest("a"),
  ).toBeNull();
  const current = screen.getByRole("region", { name: "catalog.current" });
  expect(within(current).getByRole("link").getAttribute("href")).toBe(
    "/campus/classroom/public-room",
  );
});

test("empty filtered pages continue loading without reporting an empty catalog prematurely", () => {
  const loadMore = vi.fn();
  queries.mockImplementation((name: string) => ({
    results: [],
    status: name === "classes:listCatalog" ? "CanLoadMore" : "Exhausted",
    loadMore,
  }));
  render(<CourseCatalog />);
  expect(loadMore).toHaveBeenCalledWith(24);
});

test("current classes precede upcoming; only actual broadcasts are LIVE and clock updates do not reset the course grid", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T16:00:00Z"));
  const course = {
    _id: "course",
    name: "Arithmetic",
    curriculumTitle: "Arithmetic",
    curriculumColor: "#197db8",
    accessMode: "school",
    campusName: "Campus",
    gradeName: "8th Grade",
  };
  const session = {
    title: "Arithmetic",
    start: Date.now(),
    timeZone: "America/Tegucigalpa",
    roomName: "room",
    canOpen: true,
    isLive: false,
  };
  queries.mockImplementation((name: string) => ({
    results:
      name === "classes:listCurrentCatalog"
        ? [
            { ...course, currentSession: session },
            {
              ...course,
              _id: "live",
              name: "Literature",
              currentSession: {
                ...session,
                roomName: "live-room",
                isLive: true,
              },
            },
          ]
        : [
            {
              ...course,
              nextSession: { ...session, start: Date.now() + 3_600_000 },
            },
          ],
    status: "Exhausted",
    loadMore: vi.fn(),
  }));
  render(<CourseCatalog />);
  expect(
    screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent),
  ).toEqual(["catalog.current", "catalog.upcoming", "catalog.allCourses"]);
  const current = screen.getByRole("region", { name: "catalog.current" });
  expect(within(current).getAllByRole("link")).toHaveLength(2);
  expect(within(current).getAllByText("common.live")).toHaveLength(1);
  expect(
    queries.mock.calls.every(([, args]) => args.visibility === "all"),
  ).toBe(true);
  const originalGridTime = queries.mock.calls.find(
    ([name]) => name === "classes:listCatalog",
  )![1].now;
  act(() => vi.advanceTimersByTime(60_000));
  expect(
    queries.mock.calls
      .filter(([name]) => name === "classes:listCatalog")
      .every(([, args]) => args.now === originalGridTime),
  ).toBe(true);
  expect(
    queries.mock.calls
      .filter(([name]) => name === "classes:listCurrentCatalog")
      .at(-1)![1].now,
  ).toBe(originalGridTime + 60_000);
});
