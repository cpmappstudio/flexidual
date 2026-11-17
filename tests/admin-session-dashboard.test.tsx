import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import DashboardPage from "@/app/[locale]/[orgSlug]/dashboard/page";
import AdminDashboard from "@/components/dashboards/admin-dashboard";
import { AdminSessionReview } from "@/components/dashboards/admin-session-review";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import messages from "@/messages/en.json";

const state = vi.hoisted(() => ({
  auth: vi.fn(),
  fetchQuery: vi.fn(),
  useQuery: vi.fn(),
  useQueries: vi.fn(),
  chart: vi.fn(),
  area: vi.fn(),
  bar: vi.fn(),
  canViewPeople: true,
  canManageInstitution: false,
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: state.auth }));
vi.mock("convex/nextjs", () => ({ fetchQuery: state.fetchQuery }));
vi.mock("convex/react", () => ({
  useQuery: state.useQuery,
  useQueries: state.useQueries,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(path);
  },
}));
vi.mock("@/hooks/use-staff-access", () => ({
  useStaffAccess: () => ({
    access: {
      canViewPeople: state.canViewPeople,
      canManageInstitution: state.canManageInstitution,
    },
    isLoading: false,
  }),
}));
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  ChartLegend: () => null,
  ChartLegendContent: () => null,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));
vi.mock("recharts", () => ({
  ComposedChart: ({
    children,
    data,
  }: {
    children: ReactNode;
    data: unknown;
  }) => {
    state.chart(data);
    return children;
  },
  Area: (props: unknown) => {
    state.area(props);
    return null;
  },
  Bar: (props: unknown) => {
    state.bar(props);
    return null;
  },
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
vi.mock("@/components/classroom/session-record", () => ({
  SessionRecordView: () => <p>Existing session record</p>,
  getSessionRecordings: () => [],
}));
vi.mock("@/components/recording-player-modal", () => ({
  RecordingPlayerModal: () => null,
}));
vi.mock("@/components/classroom/session-closeout-dialog", () => ({
  SessionCloseoutDialog: () => null,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
  state.canViewPeople = true;
  state.canManageInstitution = false;
});

const schoolId = "school-id" as Id<"schools">;
const campusId = "campus-id" as Id<"campuses">;
const params = Promise.resolve({ locale: "en", orgSlug: "campus" });

test("Abeka only subscribes for institutional admins and keeps the dated snapshot after the week changes", () => {
  const zone = "America/Tegucigalpa";
  const title = "Abeka activity · last 7 days";
  state.useQuery.mockReturnValue({ institutionTimeZone: zone, periods: [] });
  const snapshot = {
    syncedAt: Date.parse("2026-11-12T09:00:00Z"),
    fromDate: "2026-11-06",
    throughDate: "2026-11-12",
    timeZone: zone,
    viewers: 0,
    students: 5,
  };
  const dashboard = (today: string) => (
    <NextIntlClientProvider locale="en" timeZone={zone} messages={messages}>
      <AdminDashboard
        key={today}
        schoolId={schoolId}
        campusId={campusId}
        today={today}
        timeZone={zone}
      />
    </NextIntlClientProvider>
  );
  const view = render(dashboard("2026-11-13"));
  expect(state.useQueries).not.toHaveBeenCalled();
  state.canManageInstitution = true;
  state.useQueries.mockReturnValue({ activity: null });
  view.rerender(dashboard("2026-11-13"));
  expect(screen.queryByRole("heading", { name: title })).toBeNull();
  expect(state.useQueries).toHaveBeenCalledWith({
    activity: { query: api.abeka.getWeeklyActivity, args: { schoolId } },
  });
  state.useQueries.mockReturnValue({
    activity: {
      snapshot,
      lastSyncedAt: snapshot.syncedAt,
      nextSyncAt: Date.parse("2026-11-17T02:00:00Z"),
    },
  });
  view.rerender(dashboard("2026-11-13"));
  expect(
    screen.getByText("0 of 5 synced students viewed at least one lesson"),
  ).toBeTruthy();
  expect(screen.getByText("0%")).toBeTruthy();
  expect(screen.queryByText(/Next scheduled sync:/)).toBeNull();
  const range = "Nov 6 – 12, 2026";
  expect(screen.getByText(range)).toBeTruthy();
  state.useQueries.mockReturnValue({
    activity: {
      snapshot: { ...snapshot, viewers: 4 },
      lastSyncedAt: snapshot.syncedAt,
    },
  });
  view.rerender(dashboard("2026-11-13"));
  expect(screen.getByText("80%")).toBeTruthy();
  view.rerender(dashboard("2026-11-16"));
  expect(screen.getByText(range)).toBeTruthy();
  expect(screen.getByText("80%")).toBeTruthy();
  state.useQueries.mockReturnValue({
    activity: {
      snapshot: { ...snapshot, timeZone: "UTC" },
      lastSyncedAt: snapshot.syncedAt,
      nextSyncAt: Date.parse("2026-11-17T02:00:00Z"),
    },
  });
  view.rerender(dashboard("2026-11-16"));
  expect(
    screen.getByText(
      /The activity summary is generated when a full institution sync/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/Next scheduled sync: Nov 16, 2026.*8:00 PM/),
  ).toBeTruthy();
  expect(screen.queryByText(range)).toBeNull();
  expect(screen.queryByText("80%")).toBeNull();
});

test("checks the administrative role on the server before fetching campus or institution metadata", async () => {
  state.auth.mockResolvedValue({ userId: null });
  await expect(DashboardPage({ params })).rejects.toThrow("/en/sign-in");
  expect(state.fetchQuery).not.toHaveBeenCalled();

  state.auth.mockResolvedValue({
    userId: "user",
    getToken: async () => "token",
  });
  state.fetchQuery.mockResolvedValueOnce({
    role: "teacher",
    canViewPeople: false,
  });
  await expect(DashboardPage({ params })).rejects.toThrow("/en/campus");
  expect(state.fetchQuery).toHaveBeenCalledTimes(1);
  expect(state.fetchQuery).toHaveBeenCalledWith(
    api.organizations.getStaffContext,
    { orgSlug: "campus" },
    { token: "token" },
  );

  state.fetchQuery.mockImplementation((query) => {
    switch (getFunctionName(query)) {
      case "organizations:getStaffContext":
        return { role: "principal", canViewPeople: true };
      case "organizations:getSettingsContext":
        return {
          institution: { _id: schoolId, timeZone: "America/Tegucigalpa" },
        };
      case "organizations:resolveSlug":
        return { type: "campus", _id: campusId, name: "Campus" };
    }
  });
  expect((await DashboardPage({ params })).props).toMatchObject({
    schoolId,
    campusId,
    timeZone: "America/Tegucigalpa",
    today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  });
});

test("loads one four-week summary for the campus, preserves zero versus missing data, and hides data after revocation", () => {
  state.useQuery.mockReturnValue({
    institutionTimeZone: "America/Tegucigalpa",
    periods: [
      {
        _id: "period",
        name: "Term",
        startDate: "2026-08-01",
        endDate: "2027-05-31",
      },
    ],
  });
  const summary = {
    timeZone: "America/Tegucigalpa",
    weeks: [
      { weekStart: "2026-10-12", counts: null, refreshedAt: null },
      {
        weekStart: "2026-10-19",
        counts: {
          scheduled: 0,
          completed: 0,
          cancelled: 0,
          noStart: 0,
          other: 0,
        },
        refreshedAt: Date.parse("2026-11-11T09:00:00Z"),
      },
    ],
  };
  state.useQueries.mockReturnValue({ summary });
  const dashboard = () => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AdminDashboard
        schoolId={schoolId}
        campusId={campusId}
        today="2026-11-12"
        timeZone="America/Tegucigalpa"
      />
    </NextIntlClientProvider>
  );
  const view = render(dashboard());
  expect(screen.getByRole("heading", { level: 1 }).classList).toContain(
    "sr-only",
  );
  const periodRequest = () => state.useQuery.mock.lastCall!;
  expect(getFunctionName(periodRequest()[0])).toBe("academicSettings:get");
  expect(periodRequest()[1]).toEqual({ schoolId, campusId });
  const expectSummaryRequest = (weekStart: string, weekEnd = "2026-11-09") => {
    const { summary } = state.useQueries.mock.calls.findLast(
      ([q]) => q.summary,
    )![0];
    expect(getFunctionName(summary.query)).toBe(
      "adminSessionDashboard:getWeeklySessions",
    );
    expect(summary.args).toEqual({
      academicPeriodId: "period",
      campusId,
      weekStart,
      weekEnd,
    });
  };
  expectSummaryRequest("2026-10-12");
  expect(screen.getByText("Summary not available")).toBeTruthy();
  expect(
    within(screen.getByRole("row", { name: /Oct 12/ })).getAllByText("—"),
  ).toHaveLength(5);
  expect(
    within(screen.getByRole("row", { name: /Oct 19/ })).getAllByText("0"),
  ).toHaveLength(5);
  const table = screen.getByRole("table");
  const scrollRegion = screen.getByRole("region", {
    name: "Weekly live class sessions",
  });
  expect(scrollRegion.contains(table)).toBe(true);
  expect(scrollRegion.tabIndex).toBe(0);
  const card = screen.getByTestId("chart").closest('[data-slot="card"]');
  expect(card?.contains(table)).toBe(true);
  expect(table.parentElement?.parentElement?.classList).not.toContain("border");
  const indicatorValues = () =>
    Array.from(
      screen
        .getByLabelText("Totals for the selected weeks")
        .querySelectorAll("dd"),
      (node) => node.textContent,
    );
  expect(indicatorValues()).toEqual(["—", "—", "—", "—"]);
  expect(state.chart.mock.lastCall?.[0][0]).toEqual({
    weekStart: "2026-10-12",
    scheduled: null,
    completed: null,
  });
  expect(state.chart.mock.lastCall?.[0][1]).toEqual({
    weekStart: "2026-10-19",
    scheduled: 0,
    completed: 0,
  });
  const refreshedAt = Date.parse("2026-11-11T09:00:00Z");
  const counts = {
    scheduled: 10,
    completed: 5,
    cancelled: 2,
    noStart: 2,
    other: 1,
  };
  state.area.mockClear();
  state.useQueries.mockReturnValue({
    summary: {
      ...summary,
      weeks: [
        { weekStart: "2026-10-12", counts, refreshedAt },
        { weekStart: "2026-10-19", counts, refreshedAt },
        { weekStart: "2026-11-09", counts, refreshedAt },
      ],
    },
  });
  view.rerender(dashboard());
  expectSummaryRequest("2026-10-12");
  expect(indicatorValues()).toEqual(["20", "10", "4", "4"]);
  expect(state.chart.mock.lastCall?.[0]).toEqual([
    { weekStart: "2026-10-12", scheduled: 10, completed: 5 },
    { weekStart: "2026-10-19", scheduled: 10, completed: 5 },
  ]);
  expect(
    state.area.mock.calls.map(([{ dataKey, stackId, connectNulls }]) => [
      dataKey,
      stackId,
      connectNulls,
    ]),
  ).toEqual([
    ["scheduled", undefined, false],
    ["completed", undefined, false],
  ]);
  expect(state.bar).not.toHaveBeenCalled();

  state.useQueries.mockReturnValue({
    summary: new ConvexError("DASHBOARD_READ_BUDGET_EXCEEDED"),
  });
  fireEvent.click(screen.getByRole("button", { name: "Previous four weeks" }));
  expectSummaryRequest("2026-09-14", "2026-10-12");
  expect(screen.getByRole("alert").textContent).toContain("No partial counts");
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByLabelText("Totals for the selected weeks")).toBeNull();
  const viewOneWeek = screen.getByRole("button", { name: "View one week" });
  viewOneWeek.focus();
  fireEvent.click(viewOneWeek);
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: "Weekly live class sessions" }),
  );
  expectSummaryRequest("2026-10-05", "2026-10-12");
  expect(screen.getByRole("alert").textContent).toContain("No partial counts");
  expect(screen.queryByRole("button", { name: "View one week" })).toBeNull();
  state.useQueries.mockReturnValue({
    summary: { ...summary, weeks: [summary.weeks[1]] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next week" }));
  expectSummaryRequest("2026-10-12", "2026-10-19");
  fireEvent.click(screen.getByRole("button", { name: "Next week" }));
  expectSummaryRequest("2026-10-19", "2026-10-26");
  expect(screen.getByRole("table")).toBeTruthy();

  state.canViewPeople = false;
  state.useQueries.mockClear();
  view.rerender(dashboard());
  expect(periodRequest()[1]).toBe("skip");
  expect(state.useQueries).not.toHaveBeenCalled();
  expect(screen.queryByRole("table")).toBeNull();
});

test("attendance reuses the summary and distinguishes an unprepared week from zero confirmed records", () => {
  state.useQuery.mockReturnValue({
    institutionTimeZone: "America/Tegucigalpa",
    periods: [
      {
        _id: "period",
        name: "Term",
        startDate: "2026-08-01",
        endDate: "2027-05-31",
      },
    ],
  });
  const zero = { present: 0, partial: 0, absent: 0, excused: 0 };
  const confirmed = { present: 10, partial: 2, absent: 1, excused: 3 };
  const snapshot = (attendance: typeof zero) => ({
    summary: {
      timeZone: "America/Bogota",
      weeks: [
        { weekStart: "2026-10-12", counts: null, attendance, refreshedAt: 1 },
        {
          weekStart: "2026-10-19",
          counts: null,
          attendance: null,
          refreshedAt: null,
        },
      ],
    },
  });
  state.useQueries.mockReturnValue(snapshot(zero));
  const dashboard = () => (
    <NextIntlClientProvider
      locale="en"
      timeZone="America/Tegucigalpa"
      messages={messages}
    >
      <AdminDashboard
        schoolId={schoolId}
        campusId={campusId}
        today="2026-11-12"
        timeZone="America/Tegucigalpa"
      />
    </NextIntlClientProvider>
  );
  const view = render(dashboard());
  const card = screen
    .getByRole("heading", { name: "Confirmed attendance by week" })
    .closest<HTMLElement>('[data-slot="card"]')!;
  expect(
    within(card).getByText("Some weeks do not have an attendance summary yet."),
  ).toBeTruthy();
  expect(
    within(card).getByText(
      "Weeks with summaries have no confirmed attendance records.",
    ),
  ).toBeTruthy();
  expect(state.chart).not.toHaveBeenCalled();

  state.useQueries.mockReturnValue(snapshot(confirmed));
  view.rerender(dashboard());
  expect(
    within(card).getByText(
      "Weeks marked with * do not have an attendance summary yet.",
    ),
  ).toBeTruthy();
  expect(state.chart.mock.lastCall?.[0]).toEqual([
    { weekStart: "2026-10-12", ...confirmed },
    { weekStart: "2026-10-19" },
  ]);
  expect(state.bar.mock.calls.map(([bar]) => bar.dataKey)).toEqual(
    Object.keys(confirmed),
  );
  expect(
    new Set(state.useQueries.mock.calls.flatMap(([q]) => Object.keys(q))),
  ).toEqual(new Set(["courses", "summary", "review", "people"]));
});

test("queries no data during the first week and trims a short range to the academic period", () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  state.useQuery.mockReturnValue({
    institutionTimeZone: "America/Tegucigalpa",
    periods: [
      {
        _id: "period",
        name: "Term",
        startDate: "2026-11-04",
        endDate: "2027-05-31",
      },
    ],
  });
  state.useQueries.mockReturnValue({
    summary: {
      timeZone: "America/Tegucigalpa",
      weeks: ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"].map(
        (weekStart) => ({ weekStart, counts: null, refreshedAt: null }),
      ),
    },
  });
  const dashboard = (today: string) => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AdminDashboard
        schoolId={schoolId}
        today={today}
        timeZone="America/Tegucigalpa"
      />
    </NextIntlClientProvider>
  );
  render(dashboard("2026-11-05"));
  expect(
    state.useQueries.mock.calls.every(([q]) => !q.summary && !q.review),
  ).toBe(true);
  expect(
    screen.getByText("This academic period has no completed weeks yet."),
  ).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();

  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  fireEvent(window, new Event("focus"));
  expect(
    state.useQueries.mock.calls.findLast(([q]) => q.summary)?.[0].summary.args,
  ).toEqual({
    academicPeriodId: "period",
    weekStart: "2026-11-02",
    weekEnd: "2026-11-09",
  });
  expect(screen.getAllByRole("row")).toHaveLength(2);
  expect(screen.queryByRole("row", { name: /Nov 9/ })).toBeNull();
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: "Previous four weeks",
    }).disabled,
  ).toBe(true);
});

test("reactively shows scoped online accounts, active courses and calendar progress", () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  state.useQuery.mockReturnValue({
    institutionTimeZone: "America/Tegucigalpa",
    periods: [
      {
        _id: "period",
        name: "Term",
        startDate: "2026-11-01",
        endDate: "2026-11-13",
      },
    ],
  });
  let people: { online: number; total: number } | Error | undefined;
  state.useQueries.mockImplementation((requests) =>
    requests.courses
      ? {
          courses: [
            { classId: "current", name: "Current course", isActive: true },
            { classId: "inactive", name: "Inactive course", isActive: false },
          ],
        }
      : requests.people
        ? { people }
        : {},
  );
  const dashboard = (today: string) => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AdminDashboard
        schoolId={schoolId}
        campusId={campusId}
        today={today}
        timeZone="America/Tegucigalpa"
      />
    </NextIntlClientProvider>
  );
  const view = render(dashboard("2026-11-12"));
  const card = screen
    .getByRole("heading", { name: "Active courses in this period" })
    .closest('[data-slot="card"]')!;
  expect(within(card as HTMLElement).getByText("1")).toBeTruthy();
  expect(screen.getByText("1 day")).toBeTruthy();
  const period = screen.getByRole("progressbar", {
    name: "Calendar progress for the period",
  });
  expect(period.getAttribute("aria-valuenow")).toBe("91");
  const request = state.useQueries.mock.calls.find(([q]) => q.people)?.[0]
    .people;
  expect(getFunctionName(request.query)).toBe(
    getFunctionName(api.adminSessionDashboard.getPeopleSnapshot),
  );
  expect(request.args).toEqual({ schoolId, campusId });
  expect(screen.getByText("Loading…")).toBeTruthy();
  people = { online: 2, total: 10 };
  view.rerender(dashboard("2026-11-12"));
  expect(screen.getByText("2 of 10")).toBeTruthy();
  expect(screen.getByText("2 online")).toBeTruthy();
  expect(screen.getByText("8 offline")).toBeTruthy();
  expect(screen.queryByText(/Checked at/)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Refresh online users" }),
  ).toBeNull();
  people = { online: 3, total: 10 };
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  fireEvent(window, new Event("focus"));
  view.rerender(dashboard("2026-11-15"));
  expect(screen.getByText("3 of 10")).toBeTruthy();
  expect(screen.getByText("7 offline")).toBeTruthy();
  expect(
    screen
      .getByRole("progressbar", { name: "Users online" })
      .getAttribute("aria-valuenow"),
  ).toBe("30");
  expect(screen.getByText("0 days")).toBeTruthy();
  expect(period.getAttribute("aria-valuenow")).toBe("100");
  people = { online: 0, total: 0 };
  view.rerender(dashboard("2026-11-15"));
  expect(screen.getByText("0 of 0")).toBeTruthy();
  expect(
    screen.queryByRole("progressbar", { name: "Users online" }),
  ).toBeNull();
  people = new ConvexError("DASHBOARD_READ_BUDGET_EXCEEDED");
  view.rerender(dashboard("2026-11-15"));
  expect(screen.getByText("Count unavailable")).toBeTruthy();
  expect(screen.queryByText("0 of 0")).toBeNull();
});

test("review pagination can advance past an empty filtered page and return to it", () => {
  const row = {
    scheduleId: "pending-session",
    className: "Pending science class",
    start: Date.parse("2026-11-02T14:00Z"),
    end: Date.parse("2026-11-02T15:00Z"),
    roomName: "science-room",
    reason: "reportPending",
  };
  state.useQueries.mockImplementation(({ review }) => ({
    review: {
      timeZone: "America/Tegucigalpa",
      rows: review.args.cursor ? [row] : [],
      nextCursor: review.args.cursor ? null : "after-filtered-rows",
    },
  }));
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AdminSessionReview
        scope={{
          academicPeriodId: "period" as Id<"academicPeriods">,
          weekStart: "2026-10-19",
          weekEnd: "2026-11-16",
        }}
        focusFallback={{ current: null }}
      />
    </NextIntlClientProvider>,
  );
  expect(
    screen.getByText(messages.adminDashboard.reviewEmptyPage),
  ).toBeTruthy();
  expect(screen.queryByText(messages.adminDashboard.reviewEmpty)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(state.useQueries.mock.lastCall?.[0].review.args.cursor).toBe(
    "after-filtered-rows",
  );
  expect(screen.getByText(row.className)).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Next" }).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(state.useQueries.mock.lastCall?.[0].review.args.cursor).toBeNull();
  expect(
    screen.getByText(messages.adminDashboard.reviewEmptyPage),
  ).toBeTruthy();
});

test("filters the weekly summary and review, and only reads session detail when opened", () => {
  state.useQuery.mockReturnValue({
    institutionTimeZone: "America/Tegucigalpa",
    periods: [
      {
        _id: "period",
        name: "Term",
        startDate: "2026-08-01",
        endDate: "2027-05-31",
      },
    ],
  });
  let courses: { classId: string; name: string }[] | Error = [
    { classId: "science", name: "Science" },
    { classId: "math", name: "Math" },
  ];
  let overBudget = false;
  state.useQueries.mockImplementation((requests) => ({
    ...(requests.courses ? { courses } : {}),
    ...(requests.summary
      ? {
          summary: overBudget
            ? new ConvexError("DASHBOARD_READ_BUDGET_EXCEEDED")
            : {
                timeZone: "America/Tegucigalpa",
                weeks: [
                  {
                    weekStart: requests.summary.args.weekStart,
                    refreshedAt: 1,
                    counts: null,
                    attendance: {
                      present: requests.summary.args.classId ? 6 : 15,
                      partial: 2,
                      absent: 1,
                      excused: 0,
                    },
                  },
                ],
              },
        }
      : {}),
    ...(requests.review
      ? {
          review: {
            timeZone: "America/Tegucigalpa",
            rows: [
              {
                scheduleId: "class-session",
                className: "Science",
                start: Date.parse("2026-11-02T14:00:00Z"),
                end: Date.parse("2026-11-02T15:00:00Z"),
                roomName: "science-room",
                reason: "reportPending",
              },
            ],
            nextCursor: "second-page",
          },
        }
      : {}),
  }));
  const dashboard = () => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AdminDashboard
        schoolId={schoolId}
        campusId={campusId}
        today="2026-11-12"
        timeZone="America/Tegucigalpa"
      />
    </NextIntlClientProvider>
  );
  const view = render(dashboard());
  const lastRequest = (name: string) =>
    state.useQueries.mock.calls.findLast(([query]) => query[name])?.[0];
  expect(lastRequest("review")?.review.args.classId).toBeUndefined();
  expect(
    screen.getByText("Class report pending", { exact: false }),
  ).toBeTruthy();
  expect(lastRequest("record")).toBeUndefined();
  expect(state.chart.mock.lastCall?.[0][0].present).toBe(15);
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Course" }), {
    key: "ArrowDown",
  });
  fireEvent.click(screen.getByRole("option", { name: "Science" }));
  expect(lastRequest("summary")?.summary.args).toMatchObject({
    campusId,
    classId: "science",
  });
  expect(
    screen.getByRole("heading", {
      name: "Classes requiring review",
    }),
  ).toBeTruthy();
  expect(state.chart.mock.lastCall?.[0][0].present).toBe(6);
  expect(
    state.useQueries.mock.calls.findLast(([q]) => q.review)?.[0].review.args,
  ).toEqual({
    academicPeriodId: "period",
    campusId,
    classId: "science",
    weekStart: "2026-10-12",
    weekEnd: "2026-11-09",
    cursor: null,
  });
  expect(state.useQueries.mock.calls.every(([q]) => !q.record)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(screen.getByRole("dialog", { name: "Science" })).toBeTruthy();
  expect(state.useQueries.mock.lastCall?.[0].record.args).toEqual({
    academicPeriodId: "period",
    campusId,
    classId: "science",
    scheduleId: "class-session",
  });
  const stableRequests = ["summary", "review", "record"].map(lastRequest);
  view.rerender(dashboard());
  ["summary", "review", "record"].forEach((name, index) => {
    expect(lastRequest(name)).toBe(stableRequests[index]);
  });
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(state.useQueries.mock.lastCall?.[0].review.args.cursor).toBe(
    "second-page",
  );
  fireEvent.click(screen.getByRole("button", { name: "Previous four weeks" }));
  expect(
    state.useQueries.mock.calls.findLast(([q]) => q.review)?.[0].review.args,
  ).toMatchObject({
    weekStart: "2026-09-14",
    weekEnd: "2026-10-12",
    cursor: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  courses = new Error("Could not load courses");
  view.rerender(dashboard());
  expect(
    state.useQueries.mock.calls.findLast(([q]) => q.review)?.[0].review.args,
  ).toMatchObject({ classId: "science", cursor: "second-page" });

  courses = [{ classId: "math", name: "Math" }];
  state.useQueries.mockClear();
  view.rerender(dashboard());
  expect(screen.getByRole("combobox", { name: "Course" }).textContent).toBe(
    "All courses",
  );
  const requests = state.useQueries.mock.calls.map(([query]) => query);
  expect(
    requests.findLast((query) => query.summary)?.summary.args,
  ).not.toHaveProperty("classId");
  const review = requests.findLast((query) => query.review)?.review.args;
  expect(review).toMatchObject({ weekStart: "2026-09-14", cursor: null });
  expect(review).not.toHaveProperty("classId");
  expect(
    screen.getByRole("heading", { name: "Classes requiring review" }),
  ).toBeTruthy();
  courses = [
    { classId: "science", name: "Science" },
    { classId: "math", name: "Math" },
  ];
  view.rerender(dashboard());
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Course" }), {
    key: "ArrowDown",
  });
  fireEvent.click(screen.getByRole("option", { name: "Science" }));
  overBudget = true;
  view.rerender(dashboard());
  overBudget = false;
  fireEvent.click(screen.getByRole("button", { name: "View one week" }));
  const narrowedScope = {
    academicPeriodId: "period",
    campusId,
    classId: "science",
    weekStart: "2026-10-05",
    weekEnd: "2026-10-12",
  };
  expect(lastRequest("summary")?.summary.args).toEqual(narrowedScope);
  expect(lastRequest("review")?.review.args).toEqual({
    ...narrowedScope,
    cursor: null,
  });
});

test("shows academic progress immediately, two courses at a time, and honors the course filter", () => {
  state.useQuery.mockReturnValue({
    institutionTimeZone: "America/Tegucigalpa",
    periods: [
      {
        _id: "period",
        name: "Term",
        startDate: "2026-08-01",
        endDate: "2027-05-31",
      },
    ],
  });
  const courses = [
    { classId: "science", name: "Science" },
    { classId: "math", name: "Math" },
    { classId: "history", name: "History" },
  ];
  state.useQueries.mockImplementation(({ courses: picker, progress }) =>
    picker
      ? { courses }
      : {
          progress: progress?.args.classIds.map((classId: string) => ({
            classId,
            lessons:
              classId === "math" ? null : { taughtLessons: 2, totalLessons: 5 },
            timetable:
              classId === "history"
                ? null
                : { elapsedMs: 18_000_000, totalMs: 36_000_000 },
          })),
        },
  );
  const dashboard = () => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AdminDashboard
        schoolId={schoolId}
        campusId={campusId}
        today="2026-11-12"
        timeZone="America/Tegucigalpa"
      />
    </NextIntlClientProvider>
  );
  const view = render(dashboard());
  const request = () =>
    state.useQueries.mock.calls.findLast(([q]) => q.progress)?.[0];
  expect(
    screen.getByRole("heading", {
      name: "Academic progress by course",
    }),
  ).toBeTruthy();
  expect(request()?.progress.args).toEqual({
    academicPeriodId: "period",
    campusId,
    today: "2026-11-12",
    classIds: ["history", "math"],
  });
  const initial = request();
  view.rerender(dashboard());
  expect(request()).toBe(initial);
  expect(
    screen
      .getByRole("progressbar", { name: "Confirmed lessons" })
      .getAttribute("aria-valuetext"),
  ).toBe("2 of 5 · 40%");
  expect(
    screen
      .getByRole("progressbar", { name: "Scheduled time elapsed" })
      .getAttribute("aria-valuetext"),
  ).toBe("5 of 10 h · 50%");
  expect(screen.getAllByText("Summary not available")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(request()?.progress.args.classIds).toEqual(["science"]);
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Course" }), {
    key: "ArrowDown",
  });
  fireEvent.click(screen.getByRole("option", { name: "Math" }));
  expect(request()?.progress.args.classIds).toEqual(["math"]);
  expect(
    screen.queryByRole("progressbar", { name: "Confirmed lessons" }),
  ).toBeNull();
});

test("refreshes progress at institutional midnight without changing query args during the same day", () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-11-13T05:58:00Z"));
  state.useQuery.mockReturnValue({
    institutionTimeZone: "America/Tegucigalpa",
    periods: [
      {
        _id: "period",
        name: "Term",
        startDate: "2026-08-01",
        endDate: "2027-05-31",
      },
    ],
  });
  const courses = [{ classId: "science", name: "Science" }];
  state.useQueries.mockImplementation((requests) =>
    requests.courses ? { courses } : {},
  );
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AdminDashboard
        schoolId={schoolId}
        today="2026-11-12"
        timeZone="America/Tegucigalpa"
      />
    </NextIntlClientProvider>,
  );
  const request = () =>
    state.useQueries.mock.calls.findLast(([q]) => q.progress)?.[0];
  const initial = request();
  expect(initial?.progress.args.today).toBe("2026-11-12");
  act(() => vi.advanceTimersByTime(60_000));
  expect(request()).toBe(initial);
  act(() => vi.advanceTimersByTime(60_000));
  expect(request()?.progress.args.today).toBe("2026-11-13");
  vi.setSystemTime(new Date("2026-11-14T06:01:00Z"));
  fireEvent(window, new Event("focus"));
  expect(request()?.progress.args.today).toBe("2026-11-14");
});

test("recomputes the day and closed weeks when the institution changes its timezone", () => {
  vi.useFakeTimers({
    toFake: [
      "Date",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
  vi.setSystemTime(new Date("2026-11-16T05:30:00Z"));
  const periods = [
    {
      _id: "period",
      name: "Term",
      startDate: "2026-08-01",
      endDate: "2027-05-31",
    },
  ];
  const mockSettings = (institutionTimeZone: string | null) =>
    state.useQuery.mockReturnValue({
      periods,
      institutionTimeZone,
      timeZone: "America/Bogota",
    });
  state.useQueries.mockImplementation((requests) =>
    requests.courses
      ? { courses: [{ classId: "science", name: "Science" }] }
      : {},
  );
  const dashboard = () => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <AdminDashboard
        schoolId={schoolId}
        campusId={campusId}
        today="2026-11-16"
        timeZone="America/Bogota"
      />
    </NextIntlClientProvider>
  );
  mockSettings("America/Bogota");
  const view = render(dashboard());
  const lastArgs = (key: string) =>
    state.useQueries.mock.calls.findLast(([q]) => q[key])?.[0][key].args;
  expect(lastArgs("summary").weekEnd).toBe("2026-11-16");
  expect(lastArgs("progress").today).toBe("2026-11-16");

  mockSettings("America/Tegucigalpa");
  state.useQueries.mockClear();
  view.rerender(dashboard());
  act(() => vi.advanceTimersByTime(0));
  expect(lastArgs("summary").weekEnd).toBe("2026-11-09");
  expect(lastArgs("progress").today).toBe("2026-11-15");
  expect(
    state.useQueries.mock.calls.every(
      ([q]) => !q.summary || q.summary.args.weekEnd === "2026-11-09",
    ),
  ).toBe(true);

  mockSettings(null);
  state.useQueries.mockClear();
  view.rerender(dashboard());
  expect(state.useQueries).not.toHaveBeenCalled();
  expect(state.useQuery.mock.lastCall?.[1]).toEqual({ schoolId, campusId });
});
