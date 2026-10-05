import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";
import { SharedWhiteboard } from "@/components/classroom/shared-whiteboard";

vi.mock("@excalidraw/excalidraw/index.css", () => ({}));

const state = vi.hoisted(() => ({
  props: {} as ExcalidrawProps,
  save: vi.fn(),
  otherMutation: vi.fn(),
  reportError: vi.fn(),
  reportDiagnostic: vi.fn(),
  room: {
    name: "test-live-room",
    state: "connected",
    on: vi.fn(),
    off: vi.fn(),
    localParticipant: { publishData: vi.fn() },
  },
}));
vi.mock("@/lib/error-tracking", () => ({
  reportRuntimeError: state.reportError,
  reportWhiteboardDiagnostic: state.reportDiagnostic,
}));
vi.mock("next/dynamic", () => ({
  default: () => (props: ExcalidrawProps) => {
    state.props = props;
    return null;
  },
}));
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => state.room,
}));
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "whiteboardSessions:upsertScene"
      ? state.save
      : state.otherMutation,
}));

type ChangeArgs = Parameters<NonNullable<ExcalidrawProps["onChange"]>>;
const shape = (id: string, version = 1, versionNonce = 1) =>
  ({ id, version, versionNonce, isDeleted: false }) as ChangeArgs[0][number];
const files: ChangeArgs[2] = {};
function change(elements: ChangeArgs[0], scrollX = 0) {
  act(() =>
    state.props.onChange?.(
      elements,
      {
        scrollX,
        scrollY: 0,
        zoom: { value: 1 },
      } as ChangeArgs[1],
      files,
    ),
  );
}
async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(80);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.save.mockResolvedValue(null);
  state.otherMutation.mockResolvedValue(null);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("viewport and selection updates do not save or postpone a pending scene", async () => {
  render(<SharedWhiteboard roomName="test-room" />);
  const elements = [shape("a")];
  change(elements);
  const persist = vi.spyOn(Storage.prototype, "setItem");
  for (let i = 1; i <= 10; i++) {
    act(() => vi.advanceTimersByTime(10));
    change(elements, i);
  }
  await flush();
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledTimes(1);
  expect(state.room.localParticipant.publishData).toHaveBeenCalled();
  for (let i = 11; i <= 20; i++) change([...elements], i);
  await flush();
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledTimes(1);
});

test("element identity, nonce, order and clearing all preserve content changes", async () => {
  render(<SharedWhiteboard roomName="test-room" />);
  for (const elements of [
    [shape("a")],
    [shape("b")],
    [shape("b", 1, 2)],
    [shape("a"), shape("b")],
    [shape("b"), shape("a")],
    [],
  ]) {
    change(elements);
    await flush();
    expect(state.save).toHaveBeenLastCalledWith({
      roomName: "test-room",
      expectedLiveRoomName: "test-live-room",
      elements,
    });
  }
  expect(state.save).toHaveBeenCalledTimes(6);
});

test("unmount flushes the last snapshot instead of reading an unmounted canvas", async () => {
  const view = render(<SharedWhiteboard roomName="test-room" />);
  const elements = [shape("last-stroke")];
  change(elements);
  view.unmount();
  await flush();
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(state.save).toHaveBeenCalledWith({
    roomName: "test-room",
    expectedLiveRoomName: "test-live-room",
    elements,
  });
});

test("a failed save can retry the same scene on the next change", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.save.mockRejectedValueOnce(new Error("offline"));
  render(<SharedWhiteboard roomName="test-room" />);
  const elements = [shape("a")];
  change(elements);
  await flush();
  change(elements);
  await flush();
  expect(state.save).toHaveBeenCalledTimes(2);
  expect(state.reportError).toHaveBeenCalledWith(expect.any(Error), {
    operation: "whiteboard.scene_save",
    live_room: "test-live-room",
    connection_state: "connected",
  });
});

test("reports stalled readiness once, without logging strokes or surviving unmount", async () => {
  const view = render(<SharedWhiteboard roomName="test-room" />);
  expect(state.reportDiagnostic).toHaveBeenCalledWith({
    operation: "whiteboard.mount",
    live_room: "test-live-room",
    readonly: false,
  });
  await act(async () => vi.advanceTimersByTime(20_000));
  expect(state.reportError).toHaveBeenCalledTimes(1);
  expect(state.reportError.mock.calls[0][1].operation).toBe(
    "whiteboard.ready_timeout",
  );
  view.unmount();
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(state.reportError).toHaveBeenCalledTimes(1);
});
