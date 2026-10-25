import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import SessionPrerecordedDialog from "@/components/classroom/session-prerecorded-dialog";

type Context = FunctionReturnType<
  typeof api.classSessionVideos.getManagementContext
>;
const mocks = vi.hoisted(() => ({
  context: undefined as unknown,
  upload: vi.fn(),
  duration: vi.fn(),
  success: vi.fn(),
  player: vi.fn(),
  client: {},
}));
vi.mock("convex/react", () => ({
  useQuery: () => mocks.context,
  useConvex: () => mocks.client,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));
vi.mock("@/lib/upload-class-session-video", () => ({
  uploadClassSessionVideo: mocks.upload,
  readSessionVideoDuration: mocks.duration,
}));
vi.mock("@/components/recording-player-modal", () => ({
  ScheduleRecordingPlayer: (props: unknown) => {
    mocks.player(props);
    return <div>video preview</div>;
  },
}));
vi.mock("@/components/classroom/session-lesson-picker", () => ({
  SessionLessonPicker: ({
    selectedLessons,
    onSelectedLessonsChange,
    disabled,
  }: {
    selectedLessons: Set<Id<"lessons">>;
    onSelectedLessonsChange: (ids: Set<Id<"lessons">>) => void;
    disabled: boolean;
  }) => (
    <button
      disabled={disabled}
      onClick={() =>
        onSelectedLessonsChange(new Set(["lesson" as Id<"lessons">]))
      }
    >
      {selectedLessons.size ? "selected lesson" : "select lesson"}
    </button>
  ),
}));

const scheduleId = "schedule" as Id<"classSchedule">;
const context: NonNullable<Context> = {
  scheduledStart: Date.UTC(2026, 9, 26, 18),
  timeZone: "America/Tegucigalpa",
  video: null,
  lessons: [
    {
      lessonId: "lesson" as Id<"lessons">,
      title: "Lesson",
      order: 1,
      selected: false,
      previousSessionCount: 0,
      lastRecordedAt: undefined,
    },
  ],
};
const file = () => new File(["video"], "lesson.mp4", { type: "video/mp4" });
function chooseFile() {
  fireEvent.change(screen.getByLabelText("sessionVideo.file"), {
    target: { files: [file()] },
  });
}
beforeEach(() => {
  mocks.context = context;
  mocks.upload.mockReset().mockResolvedValue("video");
  mocks.duration.mockReset().mockResolvedValue(60_000);
  mocks.success.mockReset();
  mocks.player.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("uploads the chosen session, file and lessons through the existing transport", async () => {
  const close = vi.fn();
  render(
    <SessionPrerecordedDialog scheduleId={scheduleId} onOpenChange={close} />,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "sessionVideo.save",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  chooseFile();
  fireEvent.click(screen.getByRole("button", { name: "select lesson" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "sessionVideo.save" }));
  });
  expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(
    mocks.client,
    expect.objectContaining({
      scheduleId,
      durationMs: 60_000,
      lessonIds: ["lesson"],
      file: expect.any(File),
      signal: expect.any(AbortSignal),
    }),
  );
  expect(mocks.success).toHaveBeenCalledWith("sessionVideo.saved");
  expect(close).toHaveBeenCalledWith(false);
});

test("loading and revoked permissions never start an upload", () => {
  mocks.context = undefined;
  const view = render(
    <SessionPrerecordedDialog scheduleId={scheduleId} onOpenChange={vi.fn()} />,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "sessionVideo.save",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  mocks.context = null;
  view.rerender(
    <SessionPrerecordedDialog scheduleId={scheduleId} onOpenChange={vi.fn()} />,
  );
  expect(screen.getByRole("alert").textContent).toBe(
    "sessionVideo.unavailable",
  );
  expect(mocks.upload).not.toHaveBeenCalled();
});

test("preview is opt-in and does not replace or preload the existing recording", () => {
  mocks.context = {
    ...context,
    video: {
      id: "existing",
      name: "previous.mp4",
      durationMs: 60_000,
      released: false,
      scheduledStart: context.scheduledStart,
    },
  };
  render(
    <SessionPrerecordedDialog scheduleId={scheduleId} onOpenChange={vi.fn()} />,
  );
  expect(mocks.player).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "sessionVideo.preview" }));
  expect(mocks.player).toHaveBeenLastCalledWith(
    expect.objectContaining({
      recordings: [
        expect.objectContaining({ prerecordedVideoId: "existing", url: null }),
      ],
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "sessionVideo.hidePreview" }),
  );
  expect(screen.queryByText("video preview")).toBeNull();
});

test("cancelling an active upload aborts transport before closing and leaves the existing file untouched", async () => {
  let signal: AbortSignal | undefined;
  mocks.upload.mockImplementation((_client, args) => {
    signal = args.signal;
    return new Promise((_, reject) =>
      args.signal.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      ),
    );
  });
  const close = vi.fn();
  render(
    <SessionPrerecordedDialog scheduleId={scheduleId} onOpenChange={close} />,
  );
  chooseFile();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "sessionVideo.save" }));
  });
  expect(screen.getByRole("status")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "sessionVideo.save",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
  });
  expect(signal?.aborted).toBe(true);
  expect(close).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
  expect(close).toHaveBeenCalledWith(false);
});

test("an unmounted editor aborts metadata reading and never launches a late upload", async () => {
  let finish!: (duration: number) => void;
  let signal: AbortSignal | undefined;
  mocks.duration.mockImplementation((_file, currentSignal) => {
    signal = currentSignal;
    return new Promise<number>((resolve) => {
      finish = resolve;
    });
  });
  const close = vi.fn();
  const view = render(
    <SessionPrerecordedDialog scheduleId={scheduleId} onOpenChange={close} />,
  );
  chooseFile();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "sessionVideo.save" }));
  });
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish(60_000);
  });
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

test("storage configuration errors explain the problem without closing the editor", async () => {
  mocks.upload.mockRejectedValue(
    new ConvexError("SESSION_VIDEO_STORAGE_NOT_CONFIGURED"),
  );
  const close = vi.fn();
  render(
    <SessionPrerecordedDialog scheduleId={scheduleId} onOpenChange={close} />,
  );
  chooseFile();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "sessionVideo.save" }));
  });
  expect(screen.getByRole("alert").textContent).toBe(
    "sessionVideo.storageNotConfigured",
  );
  expect(close).not.toHaveBeenCalled();
});

test("finalization does not offer cancellation of a commit that cannot be rolled back", async () => {
  let finish!: () => void;
  let signal: AbortSignal | undefined;
  mocks.upload.mockImplementation((_client, args) => {
    signal = args.signal;
    args.onFinalizing();
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const close = vi.fn();
  render(
    <SessionPrerecordedDialog scheduleId={scheduleId} onOpenChange={close} />,
  );
  chooseFile();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "sessionVideo.save" }));
  });
  const cancel = screen.getByRole("button", {
    name: "common.cancel",
  }) as HTMLButtonElement;
  expect(cancel.disabled).toBe(true);
  fireEvent.click(cancel);
  expect(signal?.aborted).toBe(false);
  expect(close).not.toHaveBeenCalled();
  await act(async () => {
    finish();
  });
  expect(close).toHaveBeenCalledWith(false);
});
