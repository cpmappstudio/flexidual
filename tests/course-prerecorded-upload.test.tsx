import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { ComponentProps, ComponentType } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ClassDetailPage from "@/app/[locale]/[orgSlug]/classes/[classId]/page";

const state = vi.hoisted(() => ({
  now: 0,
  classId: "course",
  authorized: true,
  upload: vi.fn(),
  duration: vi.fn(),
  success: vi.fn(),
  client: {},
}));

vi.mock("next/dynamic", async () => {
  const { lazy } = await import("react");
  return {
    default: (load: () => Promise<{ default: ComponentType }>) => lazy(load),
  };
});
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useFormatter: () => ({}),
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus", classId: state.classId }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/hooks/use-current-minute", () => ({
  useCurrentMinute: () => state.now,
}));
vi.mock("@/hooks/use-staff-access", () => ({
  useStaffAccess: () => ({ access: { canManageCampus: false } }),
}));
vi.mock("convex/react", () => ({
  useConvex: () => state.client,
  useMutation: () => vi.fn(),
  useQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args?: { scheduleId?: string },
  ) => {
    switch (getFunctionName(reference)) {
      case "classes:get":
        return {
          _id: state.classId,
          teacherId: "teacher",
          name: "Biology",
          students: [],
        };
      case "users:getCurrentUser":
        return { _id: "teacher" };
      case "lessons:getClassCurriculumProgress":
        return {
          lessons: [],
          totalLessons: 0,
          taughtLessons: 0,
          pendingLessons: 0,
          percentage: 0,
        };
      case "schedule:getMySchedule":
        return [
          { scheduleId: "current", start: 0, end: 60_000 },
          { scheduleId: "later", start: 120_000, end: 180_000 },
        ].map((schedule) => ({
          ...schedule,
          classId: state.classId,
          title: schedule.scheduleId,
          roomName: schedule.scheduleId,
          sessionType: "live",
          status: "scheduled",
          timeZone: "America/Tegucigalpa",
          canManagePrerecorded: state.authorized,
        }));
      case "classSessionVideos:getManagementContext":
        return state.authorized
          ? {
              scheduledStart: args?.scheduleId === "later" ? 120_000 : 0,
              timeZone: "America/Tegucigalpa",
              video: null,
              lessons: [],
            }
          : null;
      default:
        return [];
    }
  },
}));
vi.mock("@/lib/upload-class-session-video", () => ({
  uploadClassSessionVideo: state.upload,
  readSessionVideoDuration: state.duration,
}));
vi.mock("sonner", () => ({ toast: { success: state.success } }));
vi.mock("@/components/recording-player-modal", () => ({
  ScheduleRecordingPlayer: () => null,
}));
vi.mock("@/components/classroom/session-lesson-picker", () => ({
  SessionLessonPicker: () => null,
}));
vi.mock("@/components/teaching/classes/past-classes-panel", () => ({
  PastClassesPanel: () => null,
}));
vi.mock("@/components/teaching/classes/class-overview-sidebar", () => ({
  ClassOverviewSidebar: () => null,
}));
vi.mock("@/components/teaching/classes/student-manager", () => ({
  StudentManager: () => null,
}));
vi.mock("@/components/teaching/classes/course-tasks-tab", () => ({
  CourseTasksTab: () => null,
}));
vi.mock("@/components/whiteboard/course-notebook", () => ({
  CourseNotebook: () => null,
}));
vi.mock("@/components/teaching/curriculums/curriculum-icon", () => ({
  CurriculumIcon: () => null,
}));
vi.mock("@/components/student/rocket-transition", () => ({
  RocketLaunchButtonContent: () => null,
}));

beforeEach(() => {
  state.now = 0;
  state.classId = "course";
  state.authorized = true;
  state.upload.mockReset();
  state.duration.mockReset().mockResolvedValue(60_000);
  state.success.mockReset();
});
afterEach(cleanup);

test("the next class shows its localized date and an icon-only upload in its header", () => {
  render(<ClassDetailPage />);
  const date = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Tegucigalpa",
  }).format(0);
  expect(screen.getByRole("heading", { level: 3, name: date })).toBeTruthy();
  expect(
    screen.queryByRole("heading", { level: 3, name: "current" }),
  ).toBeNull();
  const upload = screen.getAllByRole("button", {
    name: "sessionVideo.upload",
  })[0];
  expect(upload.textContent).toBe("");
  expect(upload.getAttribute("title")).toBe("sessionVideo.upload");
  expect(
    upload.parentElement?.parentElement?.classList.contains("col-start-3"),
  ).toBe(true);
});

test("the upcoming calendar link uses the current campus and course filter", () => {
  const view = render(<ClassDetailPage />);
  expect(
    screen
      .getByRole("link", { name: "navigation.calendar" })
      .getAttribute("href"),
  ).toBe("/campus/calendar?classId=course");
  state.classId = "other-course";
  view.rerender(<ClassDetailPage />);
  expect(
    screen
      .getByRole("link", { name: "navigation.calendar" })
      .getAttribute("href"),
  ).toBe("/campus/calendar?classId=other-course");
});

async function startUpload() {
  let signal!: AbortSignal;
  let finish!: () => void;
  state.upload.mockImplementation((_client, args) => {
    signal = args.signal;
    return new Promise<void>((resolve, reject) => {
      finish = resolve;
      signal.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });
  });
  const view = render(<ClassDetailPage />);
  await act(async () => {
    fireEvent.click(
      screen.getAllByRole("button", { name: "sessionVideo.upload" })[1],
    );
  });
  const input = await screen.findByLabelText("sessionVideo.file");
  fireEvent.change(input, {
    target: {
      files: [new File(["video"], "lesson.mp4", { type: "video/mp4" })],
    },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "sessionVideo.save" }));
  });
  return { ...view, signal, finish };
}

test("the course keeps one upload and its selected session when an upcoming class becomes next, then leaves the list", async () => {
  const upload = await startUpload();
  const dialog = screen.getByRole("dialog");
  const transfer = state.upload.mock.calls[0][1];
  expect(transfer.scheduleId).toBe("later");
  expect(upload.signal.aborted).toBe(false);
  for (const now of [60_001, 180_001]) {
    state.now = now;
    await act(async () => upload.rerender(<ClassDetailPage />));
    expect(screen.getAllByRole("dialog")).toEqual([dialog]);
    expect(upload.signal.aborted).toBe(false);
    expect(state.upload).toHaveBeenCalledOnce();
  }
  await act(async () => upload.finish());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(state.success).toHaveBeenCalledWith("sessionVideo.saved");
});

test("moving the dialog does not bypass permission revocation during an upload", async () => {
  const upload = await startUpload();
  state.authorized = false;
  await act(async () => upload.rerender(<ClassDetailPage />));
  expect(upload.signal.aborted).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe(
    "sessionVideo.unavailable",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "sessionVideo.save",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(state.success).not.toHaveBeenCalled();
});

test("changing course closes and aborts the previous upload without reopening it on return", async () => {
  const upload = await startUpload();
  state.classId = "other-course";
  await act(async () => upload.rerender(<ClassDetailPage />));
  expect(upload.signal.aborted).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
  state.classId = "course";
  await act(async () => upload.rerender(<ClassDetailPage />));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(state.success).not.toHaveBeenCalled();
});
