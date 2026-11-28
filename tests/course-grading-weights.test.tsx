import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({
  course: null as FunctionReturnType<typeof api.classes.get>,
  update: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
  useSearchParams: () => new URLSearchParams("edit=course-id"),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: (value: number) => String(value) }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-staff-access", () => ({
  useStaffAccess: () => ({
    access: { canManageCampus: true },
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-settings-context", () => ({
  useSettingsContext: () => ({
    context: { institution: { _id: "school-id" } },
    basePath: "/campus/settings",
  }),
}));
vi.mock("@/components/providers/alert-provider", () => ({
  useAlert: () => ({ showAlert: vi.fn() }),
}));
vi.mock("@/components/teaching/classes/course-form-fields", () => ({
  CourseFormFields: () => null,
}));
vi.mock("@/components/teaching/classes/course-weekly-calendar", () => ({
  CourseWeeklyCalendar: () => null,
}));
vi.mock(
  "@/components/teaching/classes/course-enrollment-review-dialog",
  () => ({
    CourseEnrollmentReviewDialog: () => null,
  }),
);
vi.mock(
  "@/components/teaching/classes/teacher-schedule-share-alert-dialog",
  () => ({
    TeacherScheduleShareAlertDialog: () => null,
  }),
);
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: () => state.update,
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      if (args === "skip") return undefined;
      switch (getFunctionName(ref)) {
        case "classes:get":
          return state.course;
        case "organizations:resolveSlug":
          return { type: "campus", _id: "campus-id" };
        case "curriculums:list":
          return [];
        case "users:getUsers":
          return [];
        case "grades:list":
          return [];
        case "classes:listWeeklyScheduleGuides":
          return [];
        case "academicSettings:getGradingWeights":
          return {
            weights: [
              { category: "quiz", weightBps: 2_000 },
              { category: "assignment", weightBps: 8_000 },
            ],
            version: 1,
          };
        case "academicSettings:getGradingWeightsForCourse":
          return {
            institutionalWeights: [
              { category: "quiz", weightBps: 2_000 },
              { category: "assignment", weightBps: 8_000 },
            ],
          };
        case "academicSettings:get":
          return {
            periods: [
              {
                _id: "period-id",
                name: "2026",
                startDate: "2026-01-01",
                endDate: "2026-12-31",
              },
            ],
            timeZone: "UTC",
            scheduleStartMinutes: 480,
            scheduleEndMinutes: 1_080,
          };
        default:
          throw new Error(`Unexpected query ${getFunctionName(ref)}`);
      }
    },
  };
});

import CoursePage from "@/app/[locale]/[orgSlug]/classes/(staff)/new/page";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.update.mockReset().mockResolvedValue(null);
  state.push.mockReset();
  state.course = {
    _id: "course-id" as Id<"classes">,
    _creationTime: 1,
    name: "Math",
    curriculumId: "curriculum-id" as Id<"curriculums">,
    teacherId: "teacher-id" as Id<"users">,
    gradeCode: "05",
    schoolId: "school-id" as Id<"schools">,
    campusId: "campus-id" as Id<"campuses">,
    academicPeriodId: "period-id" as Id<"academicPeriods">,
    academicYear: "2026",
    timeZone: "UTC",
    teacherName: "Teacher",
    gradeName: "Grade 5",
    liveAccess: { mode: "private", allowedGradeCodes: [] },
    weeklySlots: [
      {
        dayOfWeek: 2,
        startMinutes: 540,
        durationMinutes: 60,
        sessionType: "live",
      },
    ],
    isActive: true,
    createdAt: 1,
    createdBy: "admin-id" as Id<"users">,
    students: [],
    curriculumTitle: "Math",
    curriculumIconKey: "microscope",
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const quizInput = () =>
  screen.getByLabelText<HTMLInputElement>("categories.quiz (%)");
const assignmentInput = () =>
  screen.getByLabelText<HTMLInputElement>("categories.assignment (%)");
const save = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "common.saveChanges" });

test("the actual course editor saves a complete override with its starting version", async () => {
  render(<CoursePage />);
  expect(quizInput().value).toBe("20");
  fireEvent.click(screen.getByRole("checkbox", { name: "override" }));
  fireEvent.change(quizInput(), { target: { value: "30" } });
  expect(save().disabled).toBe(true);
  fireEvent.change(assignmentInput(), { target: { value: "70" } });
  fireEvent.click(save());
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: "course-id",
        expectedGradingWeightsVersion: 0,
        gradingWeights: [
          { category: "quiz", weightBps: 3_000 },
          { category: "assignment", weightBps: 7_000 },
        ],
      }),
    ),
  );
  expect(state.push).toHaveBeenCalledWith("/campus/classes/course-id");
});

test("course editing preserves an untouched override and resetting it explicitly restores inheritance", async () => {
  state.course!.gradingWeights = [
    { category: "quiz", weightBps: 7_000 },
    { category: "assignment", weightBps: 3_000 },
  ];
  state.course!.gradingWeightsVersion = 3;
  const view = render(<CoursePage />);
  fireEvent.click(save());
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0]).not.toHaveProperty("gradingWeights");
  await waitFor(() => expect(state.push).toHaveBeenCalled());
  view.unmount();
  render(<CoursePage />);
  fireEvent.click(screen.getByRole("checkbox", { name: "override" }));
  expect(quizInput().value).toBe("20");
  fireEvent.click(save());
  await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2));
  expect(state.update.mock.calls[1][0]).toMatchObject({
    gradingWeights: null,
    expectedGradingWeightsVersion: 3,
  });
});

test("a remote course configuration cannot silently overwrite a local weight edit", () => {
  const view = render(<CoursePage />);
  fireEvent.click(screen.getByRole("checkbox", { name: "override" }));
  fireEvent.change(quizInput(), { target: { value: "30" } });
  fireEvent.change(assignmentInput(), { target: { value: "70" } });
  state.course = {
    ...state.course!,
    gradingWeights: [
      { category: "quiz", weightBps: 6_000 },
      { category: "assignment", weightBps: 4_000 },
    ],
    gradingWeightsVersion: 1,
  };
  view.rerender(<CoursePage />);
  expect(quizInput().value).toBe("30");
  expect(save().disabled).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe("grading.weights.stale");
  fireEvent.click(
    screen.getByRole("button", { name: "grading.weights.reload" }),
  );
  expect(quizInput().value).toBe("60");
  expect(save().disabled).toBe(false);
});
