import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import CalendarPage from "@/app/[locale]/[orgSlug]/calendar/page";

const state = vi.hoisted(() => ({ course: "course", queries: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: () => ({ orgSlug: "campus" }),
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams(state.course ? { classId: state.course } : {}),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/schedule/schedule-item", () => ({
  ScheduleItem: () => null,
}));
vi.mock("@/components/calendar/dialog/calendar-occurrence-dialog", () => ({
  CalendarOccurrenceDialog: () => null,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("@/lib/rbac", () => ({ getRoleForOrg: () => "teacher" }));
vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ user: { _id: "teacher" } }),
}));
vi.mock("@/hooks/use-current-minute", () => ({
  useCurrentMinute: () => Date.UTC(2026, 9, 24),
}));
vi.mock("@/hooks/use-staff-access", () => ({
  useStaffAccess: () => ({ access: { canManageCampus: false } }),
}));
vi.mock("@/hooks/use-settings-context", () => ({
  useSettingsContext: () => ({ context: { institution: { _id: "school" } } }),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  usePaginatedQuery: () => ({
    results: [],
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
  useQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => {
    const name = getFunctionName(reference);
    state.queries(name, args);
    switch (name) {
      case "organizations:resolveSlug":
        return { type: "campus", _id: "campus" };
      case "classes:listFilterOptions":
        return { courses: [], teachers: [] };
      case "academicSettings:getScheduleWindow":
        return {
          startMinutes: 0,
          endMinutes: 1440,
          scopeType: "campus",
          institutionTimeZone: "America/Tegucigalpa",
          campusTimeZone: "America/Tegucigalpa",
        };
      default:
        return [];
    }
  },
}));
vi.mock("@/components/calendar/calendar", () => ({
  default: ({
    filters,
  }: {
    filters: {
      selectedCourseId: string | null;
      onCourseChange: (id: null) => void;
    };
  }) => (
    <div>
      <output data-testid="selected-course">
        {filters.selectedCourseId ?? "all"}
      </output>
      <button onClick={() => filters.onCourseChange(null)}>All courses</button>
    </div>
  ),
}));

beforeEach(() => {
  state.course = "course";
  state.queries.mockClear();
});
afterEach(cleanup);
const eventQueries = () =>
  state.queries.mock.calls
    .filter(([name, args]) => name === "calendar:listEvents" && args !== "skip")
    .map(([, args]) => args);

test("the course URL filters the first server query even with an already loaded campus", () => {
  render(<CalendarPage />);
  expect(screen.getByTestId("selected-course").textContent).toBe("course");
  expect(eventQueries().length).toBeGreaterThan(0);
  expect(
    eventQueries().every(
      (args) => args.classId === "course" && args.campusId === "campus",
    ),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "All courses" }));
  expect(screen.getByTestId("selected-course").textContent).toBe("all");
  expect(eventQueries().at(-1)).not.toHaveProperty("classId");
});

test("navigating to another course URL reuses the existing filter and campus scope", () => {
  const view = render(<CalendarPage />);
  state.course = "other-course";
  view.rerender(<CalendarPage />);
  expect(screen.getByTestId("selected-course").textContent).toBe(
    "other-course",
  );
  expect(eventQueries().at(-1)).toMatchObject({
    classId: "other-course",
    campusId: "campus",
  });
});
