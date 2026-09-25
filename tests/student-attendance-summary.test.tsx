import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  canEditAttendance: false,
  isMobile: false,
  recordings: [{ _id: "recording-1" }],
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    student: {
      listStudentAttendanceHistory: "attendance-history",
      getStudentDashboardStats: "student-dashboard",
    },
  },
}));
vi.mock("convex/react", () => ({
  usePaginatedQuery: (
    _query: unknown,
    args: "skip" | { status?: string; classId?: string },
  ) => {
    const allResults = [
      {
        scheduleId: "schedule-1",
        studentId: "student-1",
        classId: "class-1",
        className: "Geography 9",
        curriculumIconKey: "book",
        sessionTitle: "Latitude and longitude",
        start: Date.UTC(2026, 8, 11, 14, 20),
        end: Date.UTC(2026, 8, 11, 15),
        timeZone: "America/Bogota",
        status: "absent",
        excuseReason: null,
        attendedMinutes: 5,
        scheduledMinutes: 40,
        canEditAttendance: state.canEditAttendance,
        contentSummary: {
          lessonPreview: { order: 1, title: "Map coordinates" },
          hasMoreLessons: true,
          recordingCount: 1,
        },
      },
      {
        scheduleId: "schedule-2",
        studentId: "student-1",
        classId: "class-2",
        className: "Algebra 1",
        curriculumIconKey: "book",
        sessionTitle: "Linear equations",
        start: Date.UTC(2026, 8, 10, 14, 20),
        end: Date.UTC(2026, 8, 10, 15),
        timeZone: "America/Bogota",
        status: "partial",
        excuseReason: null,
        attendedMinutes: 18,
        scheduledMinutes: 40,
        canEditAttendance: state.canEditAttendance,
        contentSummary: {
          lessonPreview: { order: 2, title: "Linear equations" },
          hasMoreLessons: false,
          recordingCount: 0,
        },
      },
    ];
    return {
      results:
        args === "skip"
          ? []
          : allResults.filter(
              (item) =>
                (!args.status || item.status === args.status) &&
                (!args.classId || item.classId === args.classId),
            ),
      status: "Exhausted",
      loadMore: vi.fn(),
    };
  },
}));
vi.mock("@/components/attendance/attendance-record-editor", () => ({
  AttendanceRecordEditor: ({ onCancel }: { onCancel?: () => void }) => (
    <div>
      shared-inline-attendance-editor
      {onCancel && (
        <button type="button" onClick={onCancel}>
          common.cancel
        </button>
      )}
    </div>
  ),
}));
vi.mock("@/components/classroom/session-record", () => ({
  useSessionRecord: () => ({ state: "completed" }),
  getSessionRecordings: () => state.recordings,
}));
vi.mock("@/components/classroom/session-closeout-dialog", () => ({
  SessionCloseoutDialog: ({ open }: { open: boolean }) =>
    open ? <div>shared-closeout-dialog</div> : null,
}));
vi.mock("@/components/recording-player-modal", () => ({
  RecordingPlayerModal: ({ open }: { open: boolean }) =>
    open ? <div>shared-recording-player</div> : null,
}));
vi.mock("@/components/teaching/curriculums/curriculum-icon", () => ({
  CurriculumIcon: () => <span aria-hidden="true">icon</span>,
}));
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => state.isMobile,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    (namespace?: string) =>
    (key: string, values?: { count?: number; label?: string }) => {
      if (namespace === "attendance.status") return key;
      if (key === "openStatusDetails") {
        return `${values?.count} ${values?.label}`;
      }
      return `${namespace ?? "root"}.${key}`;
    },
}));

import { StudentAttendanceSummary } from "@/components/dashboards/student-attendance-summary";

beforeEach(() => {
  state.canEditAttendance = false;
  state.isMobile = false;
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

const props = {
  counts: { present: 0, partial: 1, absent: 1, excused: 0 },
  verifiedSessions: 2,
  pendingVerification: 0,
  studentId: "student-1",
  studentName: "Sam Student",
  orgSlug: "leadership-campus",
  courses: [
    { classId: "class-1" as never, className: "Geography 9" },
    { classId: "class-2" as never, className: "Algebra 1" },
  ],
  pendingSessions: [],
};

test("status and course controls filter one history with class context", () => {
  render(<StudentAttendanceSummary {...props} />);

  fireEvent.click(screen.getByRole("button", { name: /absent/i }));
  expect(screen.getByText("Geography 9")).toBeTruthy();
  expect(screen.getByText("Latitude and longitude")).toBeTruthy();
  expect(screen.queryByText("Algebra 1")).toBeNull();

  fireEvent.click(
    screen.getByRole("combobox", {
      name: "student.attendanceHistory.statusFilter",
    }),
  );
  fireEvent.click(screen.getByRole("option", { name: "partial" }));
  expect(screen.getByText("Algebra 1")).toBeTruthy();
  expect(screen.getAllByText("Linear equations")).toHaveLength(1);
  expect(screen.queryByText("Geography 9")).toBeNull();

  fireEvent.click(screen.getAllByRole("combobox")[1]);
  fireEvent.click(screen.getByRole("option", { name: "Geography 9" }));
  expect(screen.queryByText("Algebra 1")).toBeNull();
});

test("content stays supplementary while inline editing remains permission-bound", () => {
  const view = render(<StudentAttendanceSummary {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /absent/i }));

  expect(screen.getByText("1. Map coordinates")).toBeTruthy();
  expect(
    screen.getByText("student.attendanceHistory.moreLessons"),
  ).toBeTruthy();
  expect(
    screen.queryByText("student.attendanceHistory.editAttendance"),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "sessionRecord.watchRecording" }),
  );
  expect(screen.getByText("shared-recording-player")).toBeTruthy();

  view.unmount();
  state.canEditAttendance = true;
  render(<StudentAttendanceSummary {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /absent/i }));
  fireEvent.click(
    screen.getByRole("button", {
      name: "student.attendanceHistory.editAttendance",
    }),
  );
  expect(screen.getByText("shared-inline-attendance-editor")).toBeTruthy();
  expect(
    screen.queryByText("student.attendanceHistory.editAttendance"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
  expect(screen.queryByText("shared-inline-attendance-editor")).toBeNull();
  expect(
    screen.getByText("student.attendanceHistory.editAttendance"),
  ).toBeTruthy();
});

test("moves course navigation to the course title", () => {
  render(<StudentAttendanceSummary {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /absent/i }));

  const courseLink = screen.getByRole("link", { name: "Geography 9" });
  expect(courseLink.getAttribute("href")).toBe(
    "/leadership-campus/classes/class-1",
  );
  expect(courseLink.className).toContain("group/course-link");
  expect(screen.queryByText("student.attendanceHistory.viewCourse")).toBeNull();
});

test("pending verification identifies the exact class and session", () => {
  render(
    <StudentAttendanceSummary
      {...props}
      pendingVerification={1}
      pendingSessions={[
        {
          scheduleId: "pending-schedule" as never,
          classId: "class-2" as never,
          className: "Algebra 1",
          curriculumIconKey: "books",
          sessionTitle: "Quadratic equations",
          start: Date.UTC(2026, 8, 9, 14, 20),
          end: Date.UTC(2026, 8, 9, 15),
          timeZone: "America/Bogota",
          roomName: "quadratic-room",
          canCompleteReport: true,
        },
      ]}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: /student.profile.pendingVerificationSummary/,
    }),
  );
  expect(screen.getByText("Algebra 1")).toBeTruthy();
  expect(screen.getByText("Quadratic equations")).toBeTruthy();
  expect(
    screen.getByText("student.attendanceHistory.pendingDescription"),
  ).toBeTruthy();
  expect(
    screen.queryByRole("combobox", {
      name: "student.attendanceHistory.statusFilter",
    }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", {
      name: "student.attendanceHistory.completeRecord",
    }),
  );
  expect(screen.getByText("shared-closeout-dialog")).toBeTruthy();
});

test("mobile history owns its scroll and stacks attendance actions", () => {
  state.canEditAttendance = true;
  state.isMobile = true;
  render(<StudentAttendanceSummary {...props} />);

  fireEvent.click(screen.getByRole("button", { name: /absent/i }));

  expect(
    document.querySelector('[data-slot="sheet-content"]')?.className,
  ).toContain("h-[92dvh]");
  expect(
    document.querySelector('[data-slot="scroll-area"]')?.className,
  ).toContain("touch-pan-y");
  expect(
    screen.getByRole("button", {
      name: "student.attendanceHistory.editAttendance",
    }).className,
  ).toContain("w-full");
  expect(
    screen.getByText("Geography 9").closest("article")?.className,
  ).toContain("max-w-full");
});
