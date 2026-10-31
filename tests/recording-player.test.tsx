import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  ScheduleRecordingPlayer,
  type RecordingPlaybackPart,
} from "@/components/recording-player-modal";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  playback: vi.fn(),
  auth: { userId: "teacher", sessionId: "session-one" },
}));
vi.mock("convex/react", () => ({
  useQuery: mocks.query,
  useAction: () => mocks.playback,
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { number: number }) =>
    values ? `${key} ${values.number}` : key,
}));

const scheduleId = "schedule" as Id<"classSchedule">;
const uploaded = (id: string): RecordingPlaybackPart => ({
  _id: id as Id<"classSessionVideos">,
  prerecordedVideoId: id as Id<"classSessionVideos">,
  url: null,
  durationMs: 1000,
  startedAt: 0,
});
const live: RecordingPlaybackPart = {
  _id: "live" as Id<"recordings">,
  url: "https://video.test/live.mp4",
  durationMs: 2000,
  startedAt: 1,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  mocks.query.mockReset();
  mocks.playback.mockReset();
  mocks.auth = { userId: "teacher", sessionId: "session-one" };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("legacy recordings retain native playback without signing or duplicate list reads", () => {
  const { container } = render(
    <ScheduleRecordingPlayer scheduleId={scheduleId} recordings={[live]} />,
  );
  expect(container.querySelector("video")?.getAttribute("src")).toBe(live.url);
  expect(mocks.playback).not.toHaveBeenCalled();
  expect(mocks.query.mock.calls[0][1]).toBe("skip");
});

test("newly published and reordered parts do not replace the currently selected live recording", () => {
  const view = render(
    <ScheduleRecordingPlayer scheduleId={scheduleId} recordings={[live]} />,
  );
  view.rerender(
    <ScheduleRecordingPlayer
      scheduleId={scheduleId}
      recordings={[uploaded("new"), live]}
    />,
  );
  expect(view.container.querySelector("video")?.getAttribute("src")).toBe(
    live.url,
  );
  expect(mocks.playback).not.toHaveBeenCalled();
});

test("event recordings use their occurrence and reset selection for a different event", () => {
  const firstOccurrence = "event-one" as Id<"eventOccurrences">;
  const secondOccurrence = "event-two" as Id<"eventOccurrences">;
  const other = {
    ...live,
    _id: "other" as Id<"recordings">,
    url: "https://video.test/other.mp4",
  };
  mocks.query.mockImplementation((query) => {
    if (
      getFunctionName(query) !==
      getFunctionName(api.recordings.getByEventOccurrence)
    )
      return undefined;
    return [live, other];
  });
  const view = render(
    <ScheduleRecordingPlayer occurrenceId={firstOccurrence} />,
  );
  expect(mocks.query).toHaveBeenCalledWith(api.recordings.getPlayback, "skip");
  expect(mocks.query).toHaveBeenCalledWith(
    api.recordings.getByEventOccurrence,
    { occurrenceId: firstOccurrence },
  );
  fireEvent.click(screen.getByRole("button", { name: /recordings.part 2/ }));
  expect(view.container.querySelector("video")?.getAttribute("src")).toBe(
    other.url,
  );
  view.rerender(<ScheduleRecordingPlayer occurrenceId={secondOccurrence} />);
  expect(mocks.query).toHaveBeenCalledWith(
    api.recordings.getByEventOccurrence,
    { occurrenceId: secondOccurrence },
  );
  expect(view.container.querySelector("video")?.getAttribute("src")).toBe(
    live.url,
  );
});

test("signs only the selected uploaded video and ignores a late response after changing parts", async () => {
  const old = deferred<{ url: string; expiresAt: number }>();
  mocks.playback.mockReturnValueOnce(old.promise).mockResolvedValue({
    url: "https://video.test/two",
    expiresAt: Date.now() + 7_200_000,
  });
  const { container } = render(
    <ScheduleRecordingPlayer
      scheduleId={scheduleId}
      recordings={[uploaded("one"), live, uploaded("two")]}
    />,
  );
  expect(mocks.playback).toHaveBeenCalledExactlyOnceWith({ id: "one" });
  fireEvent.click(screen.getByRole("button", { name: /recordings.part 2/ }));
  await act(async () => {
    old.resolve({
      url: "https://video.test/stale",
      expiresAt: Date.now() + 7_200_000,
    });
  });
  expect(container.querySelector("video")?.getAttribute("src")).toBe(live.url);
  fireEvent.click(screen.getByRole("button", { name: /recordings.part 3/ }));
  await act(async () => {});
  expect(mocks.playback).toHaveBeenLastCalledWith({ id: "two" });
  expect(container.querySelector("video")?.getAttribute("src")).toBe(
    "https://video.test/two",
  );
});

test("closed players never request private URLs and identity changes discard old URLs", async () => {
  const response = deferred<{ url: string; expiresAt: number }>();
  mocks.playback
    .mockResolvedValueOnce({
      url: "https://video.test/old-session",
      expiresAt: Date.now() + 7_200_000,
    })
    .mockReturnValue(response.promise);
  const props = { scheduleId, recordings: [uploaded("one")] };
  const view = render(<ScheduleRecordingPlayer {...props} enabled={false} />);
  expect(mocks.playback).not.toHaveBeenCalled();
  view.rerender(<ScheduleRecordingPlayer {...props} />);
  await act(async () => {});
  expect(view.container.querySelector("video")).not.toBeNull();
  mocks.auth = { userId: "student", sessionId: "session-two" };
  view.rerender(<ScheduleRecordingPlayer {...props} />);
  expect(view.container.querySelector("video")).toBeNull();
  await act(async () => {
    response.resolve({
      url: "https://video.test/new-session",
      expiresAt: Date.now() + 7_200_000,
    });
  });
  expect(view.container.querySelector("video")?.getAttribute("src")).toBe(
    "https://video.test/new-session",
  );
});

test("signed URL renewal retains playback position for native seeking in long videos", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  mocks.playback
    .mockResolvedValueOnce({
      url: "https://video.test/first",
      expiresAt: Date.now() + 7_200_000,
    })
    .mockResolvedValue({
      url: "https://video.test/refreshed",
      expiresAt: Date.now() + 14_400_000,
    });
  const { container } = render(
    <ScheduleRecordingPlayer
      scheduleId={scheduleId}
      recordings={[uploaded("one")]}
    />,
  );
  await act(async () => {});
  const first = container.querySelector("video")!;
  fireEvent.loadedMetadata(first);
  first.currentTime = 5400;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6_900_000);
  });
  const renewed = container.querySelector("video")!;
  fireEvent.loadedMetadata(renewed);
  expect(renewed.getAttribute("src")).toBe("https://video.test/refreshed");
  expect(renewed.currentTime).toBe(5400);
  expect(mocks.playback).toHaveBeenCalledTimes(2);
});

test("failed signing is visible and explicitly retryable without fetching other videos", async () => {
  mocks.playback
    .mockRejectedValueOnce(new Error("connection lost"))
    .mockResolvedValue({
      url: "https://video.test/retry",
      expiresAt: Date.now() + 7_200_000,
    });
  const { container } = render(
    <ScheduleRecordingPlayer
      scheduleId={scheduleId}
      recordings={[uploaded("one"), uploaded("two")]}
    />,
  );
  await act(async () => {});
  expect(screen.getByRole("alert").textContent).toContain(
    "recordings.loadError",
  );
  fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
  await act(async () => {});
  expect(container.querySelector("video")?.getAttribute("src")).toBe(
    "https://video.test/retry",
  );
  expect(mocks.playback.mock.calls).toEqual([[{ id: "one" }], [{ id: "one" }]]);
});
