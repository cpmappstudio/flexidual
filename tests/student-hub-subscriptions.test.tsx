import type { ComponentProps } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { getFunctionName } from "convex/server";
import StudentHubPage from "@/components/dashboards/student-hub-page";
import messages from "@/messages/en.json";

const state = vi.hoisted(() => ({
  requests: [] as { name: string; args: unknown }[],
  events: [] as {
    scheduleId: string;
    className: string;
    title: string;
    start: number;
    end: number;
    status: string;
    sessionType: string;
    isLive: boolean;
  }[],
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: true, user: { firstName: "Student" } }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/dashboards/student-attendance-summary", () => ({
  StudentAttendanceSummary: () => null,
}));
vi.mock("@/components/dashboards/student-pending-tasks", () => ({
  StudentPendingTasks: () => null,
}));
vi.mock("@/components/presence/user-presence", () => ({
  UserPresenceText: () => null,
}));
vi.mock("@/components/schedule/next-class-panel", () => ({
  NextClassPreview: () => null,
  NextClassPanel: ({ nextClass }: { nextClass?: { title: string } | null }) => (
    <p>{nextClass?.title ?? "No next class"}</p>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(query);
    state.requests.push({ name, args });
    if (args === "skip") return undefined;
    if (name === "student:getStudentDashboardStats")
      return {
        student: { fullName: "Student Test" },
        canEdit: false,
        classes: [],
        pendingAttendanceSessions: [],
        upcomingLessons: [],
      };
    if (
      name === "schedule:getMySchedule" ||
      name === "student:getStudentDashboardSchedule"
    )
      return state.events;
    if (name === "schedule:listAccessibleLiveClasses") return [];
    return null;
  },
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  state.requests = [];
  state.events = [];
});

test.each([undefined, "student-id"])(
  "hub statistics and day subscriptions stay stable across minutes (profile=%s)",
  async (studentId) => {
    vi.useFakeTimers();
    const initial = new Date(2026, 9, 14, 12, 0).getTime();
    vi.setSystemTime(initial);
    state.events = [
      {
        scheduleId: "scheduled",
        className: "Math",
        title: "Math",
        start: initial,
        end: initial + 60_000,
        status: "scheduled",
        sessionType: "live",
        isLive: false,
      },
    ];
    const view = () => (
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <StudentHubPage studentId={studentId} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view());
    expect(screen.getByText("Math")).toBeDefined();
    const scheduleName = studentId
      ? "student:getStudentDashboardSchedule"
      : "schedule:getMySchedule";
    const keys = (name: string) => [
      ...new Set(
        state.requests
          .filter((row) => row.name === name && row.args !== "skip")
          .map((row) => JSON.stringify(row.args)),
      ),
    ];
    const initialStats = keys("student:getStudentDashboardStats");
    const initialDay = keys(scheduleName);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(screen.getByText("No next class")).toBeDefined();
    expect(keys("student:getStudentDashboardStats")).toEqual(initialStats);
    expect(keys(scheduleName)).toEqual(initialDay);
    expect(initialStats[0]).not.toContain('"now"');
    state.events = [{ ...state.events[0], status: "active", isLive: true }];
    rerender(view());
    expect(screen.getByText("Math")).toBeDefined();
    state.events = [{ ...state.events[0], status: "completed", isLive: false }];
    rerender(view());
    expect(screen.getByText("No next class")).toBeDefined();
    expect(keys(scheduleName)).toEqual(initialDay);
    await act(async () => {
      vi.setSystemTime(new Date(2026, 9, 15, 0, 0));
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(keys(scheduleName)).toHaveLength(2);
    expect(keys("student:getStudentDashboardStats")).toEqual(initialStats);
  },
);
