import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConnectionError,
  ConnectionState,
  NegotiationError,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type LocalTrackPublication,
} from "livekit-client";
import { useClassroomScreenShare } from "@/hooks/use-classroom-screen-share";
import { useClassroomMediaDeviceErrors } from "@/hooks/use-classroom-media-errors";

const { errorToast, warningToast, reportError } = vi.hoisted(() => ({
  errorToast: vi.fn(),
  warningToast: vi.fn(),
  reportError: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({
  toast: { error: errorToast, warning: warningToast },
}));
vi.mock("@/lib/error-tracking", () => ({ reportRuntimeError: reportError }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function setup() {
  const setScreenShareEnabled = vi.fn<
    (enabled: boolean, options?: unknown) => Promise<void>
  >(async () => {});
  const room = {
    name: "room-activation",
    state: ConnectionState.Connected,
    localParticipant: { setScreenShareEnabled },
  };
  const { result } = renderHook(() =>
    useClassroomScreenShare(room as unknown as Room),
  );
  return { room, result, setScreenShareEnabled };
}

function setupWithSdkEvents() {
  const room = new Room();
  room.state = ConnectionState.Connected;
  // Wire the same SDK bridge used by connect(), without opening a connection.
  Reflect.get(room, "setupLocalParticipantEvents").call(room);
  const events = vi.fn();
  room.on(RoomEvent.MediaDevicesError, events);
  const track = {
    source: Track.Source.ScreenShare,
    kind: Track.Kind.Video,
    stop: vi.fn(),
  } as unknown as LocalTrack;
  const capture = vi
    .spyOn(room.localParticipant, "createScreenTracks")
    .mockResolvedValue([track]);
  const publish = vi
    .spyOn(room.localParticipant, "publishTrack")
    .mockResolvedValue({ track } as LocalTrackPublication);
  const { result } = renderHook(() => {
    useClassroomMediaDeviceErrors(room);
    return useClassroomScreenShare(room);
  });
  return { room, result, capture, publish, events };
}

describe("screen sharing and room media errors together", () => {
  it("does not show a camera/microphone error when the screen picker is cancelled", async () => {
    const { result, capture, publish, events } = setupWithSdkEvents();
    const cancelled = Object.assign(new Error("Picker cancelled"), {
      name: "NotAllowedError",
    });
    capture.mockRejectedValueOnce(cancelled);

    expect(await result.current(true)).toBe(false);
    expect(events).toHaveBeenCalledWith(cancelled, undefined);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
    expect(errorToast).not.toHaveBeenCalled();
    expect(warningToast).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it.each(["NotSupportedError", "TypeError", "OverconstrainedError"])(
    "shows only the audio warning after a successful fallback from %s",
    async (name) => {
      const { result, capture, publish, events } = setupWithSdkEvents();
      const failure = Object.assign(new Error("Unsupported audio constraint"), {
        name,
      });
      capture.mockRejectedValueOnce(failure);

      expect(await result.current(true)).toBe(true);
      expect(events).toHaveBeenCalledWith(failure, undefined);
      expect(capture.mock.calls).toEqual([
        [{ audio: true }],
        [{ audio: false }],
      ]);
      expect(publish).toHaveBeenCalledTimes(1);
      expect(errorToast).not.toHaveBeenCalled();
      expect(warningToast).toHaveBeenCalledExactlyOnceWith(
        "classroom.screenShareAudioNotSupported",
      );
      expect(reportError).not.toHaveBeenCalled();
    },
  );

  it("keeps cancellation of the no-audio fallback quiet too", async () => {
    const { result, capture, publish, events } = setupWithSdkEvents();
    capture
      .mockRejectedValueOnce(
        Object.assign(new Error("Unsupported audio"), {
          name: "NotSupportedError",
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("Picker cancelled"), {
          name: "NotAllowedError",
        }),
      );

    expect(await result.current(true)).toBe(false);
    expect(events).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(publish).not.toHaveBeenCalled();
    expect(errorToast).not.toHaveBeenCalled();
    expect(warningToast).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("still reports a real screen capture failure through the screen handler only", async () => {
    const { room, result, capture, events } = setupWithSdkEvents();
    const failure = Object.assign(new Error("Capture aborted"), {
      name: "AbortError",
    });
    capture.mockRejectedValueOnce(failure);

    expect(await result.current(true)).toBe(false);
    expect(events).toHaveBeenCalledWith(failure, undefined);
    expect(errorToast).toHaveBeenCalledExactlyOnceWith(
      "classroom.screenShareFailed",
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure, {
      operation: "classroom.screenShare.start",
      live_room: room.name,
      connection_state: ConnectionState.Connected,
    });
    expect(warningToast).not.toHaveBeenCalled();
  });

  it.each([
    ["camera", "videoinput"],
    ["microphone", "audioinput"],
  ])(
    "still reports %s failures while screen capture is pending",
    async (device, kind) => {
      const { room, result, capture, events } = setupWithSdkEvents();
      let cancel!: (error: Error) => void;
      capture.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            cancel = reject;
          }),
      );
      const pending = result.current(true);
      const denied = Object.assign(new Error("Device permission denied"), {
        name: "NotAllowedError",
      });
      vi.spyOn(room.localParticipant, "createTracks").mockRejectedValueOnce(
        denied,
      );

      await expect(
        device === "camera"
          ? room.localParticipant.setCameraEnabled(true)
          : room.localParticipant.setMicrophoneEnabled(true),
      ).rejects.toBe(denied);
      expect(events).toHaveBeenCalledWith(denied, kind);
      expect(errorToast).toHaveBeenCalledExactlyOnceWith(
        "classroom.mediaPermissionDenied",
        { id: "classroom-media-PermissionDenied" },
      );
      cancel(
        Object.assign(new Error("Picker cancelled"), {
          name: "NotAllowedError",
        }),
      );
      expect(await pending).toBe(false);
      expect(errorToast).toHaveBeenCalledTimes(1);
      expect(reportError).not.toHaveBeenCalled();
    },
  );
});

describe("classroom screen sharing", () => {
  it("starts with audio and stops without changing room permissions", async () => {
    const { result, setScreenShareEnabled } = setup();
    expect(await result.current(true)).toBe(true);
    expect(await result.current(false)).toBe(true);
    expect(setScreenShareEnabled.mock.calls).toEqual([
      [true, { audio: true }],
      [false, { audio: true }],
    ]);
    expect(errorToast).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("does not capture before the room is connected", async () => {
    const { result, room, setScreenShareEnabled } = setup();
    room.state = ConnectionState.Reconnecting;
    expect(await result.current(true)).toBe(false);
    expect(setScreenShareEnabled).not.toHaveBeenCalled();
    expect(errorToast).toHaveBeenCalledWith(
      "classroom.screenShareConnectionError",
    );
  });

  it("treats picker cancellation as expected, without retries or error reports", async () => {
    const { result, setScreenShareEnabled } = setup();
    setScreenShareEnabled.mockRejectedValueOnce(
      new DOMException("Cancelled", "NotAllowedError"),
    );
    expect(await result.current(true)).toBe(false);
    expect(setScreenShareEnabled).toHaveBeenCalledTimes(1);
    expect(errorToast).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it.each(["NotSupportedError", "TypeError", "OverconstrainedError"])(
    "retries %s without audio and warns only after success",
    async (name) => {
      const { result, setScreenShareEnabled } = setup();
      setScreenShareEnabled.mockRejectedValueOnce(
        new DOMException("Unsupported capture constraint", name),
      );
      expect(await result.current(true)).toBe(true);
      expect(setScreenShareEnabled.mock.calls).toEqual([
        [true, { audio: true }],
        [true, { audio: false }],
      ]);
      expect(warningToast).toHaveBeenCalledWith(
        "classroom.screenShareAudioNotSupported",
      );
      expect(reportError).not.toHaveBeenCalled();
    },
  );

  it.each([
    ConnectionError.timeout("publication timed out"),
    ConnectionError.notAllowed("publication not allowed", 403),
    new NegotiationError("negotiation timed out"),
    new TypeError("Cannot read properties of undefined"),
    new DOMException(
      "sender belongs to another connection",
      "InvalidAccessError",
    ),
  ])(
    "does not retry a publication/connection failure: $name",
    async (error) => {
      const { result, room, setScreenShareEnabled } = setup();
      setScreenShareEnabled.mockRejectedValueOnce(error);
      expect(await result.current(true)).toBe(false);
      expect(setScreenShareEnabled).toHaveBeenCalledTimes(1);
      expect(errorToast).not.toHaveBeenCalledWith(
        "classroom.screenShareNotSupported",
      );
      expect(warningToast).not.toHaveBeenCalled();
      expect(reportError).toHaveBeenCalledWith(
        expect.objectContaining({ name: error.name, message: error.message }),
        {
          operation: "classroom.screenShare.start",
          live_room: room.name,
          connection_state: ConnectionState.Connected,
        },
      );
    },
  );

  it("handles a connection failure of the no-audio fallback without another retry", async () => {
    const { result, setScreenShareEnabled } = setup();
    const failure = ConnectionError.serverUnreachable("lost connection");
    setScreenShareEnabled.mockRejectedValueOnce(
      new DOMException("audio unsupported", "NotSupportedError"),
    );
    setScreenShareEnabled.mockRejectedValueOnce(failure);
    expect(await result.current(true)).toBe(false);
    expect(setScreenShareEnabled).toHaveBeenCalledTimes(2);
    expect(errorToast).toHaveBeenCalledWith(
      "classroom.screenShareConnectionError",
    );
    expect(warningToast).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(failure, expect.any(Object));
  });

  it("does not report cancellation of the no-audio fallback", async () => {
    const { result, setScreenShareEnabled } = setup();
    setScreenShareEnabled.mockRejectedValueOnce(
      new DOMException("audio unsupported", "NotSupportedError"),
    );
    setScreenShareEnabled.mockRejectedValueOnce(
      new DOMException("Cancelled", "NotAllowedError"),
    );
    expect(await result.current(true)).toBe(false);
    expect(setScreenShareEnabled).toHaveBeenCalledTimes(2);
    expect(errorToast).not.toHaveBeenCalled();
    expect(warningToast).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("catches stop failures instead of producing unhandled rejections", async () => {
    const { result, setScreenShareEnabled } = setup();
    const failure = new Error("unpublish failed");
    setScreenShareEnabled.mockRejectedValueOnce(failure);
    expect(await result.current(false)).toBe(false);
    expect(reportError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ operation: "classroom.screenShare.stop" }),
    );
    expect(errorToast).toHaveBeenCalledWith("classroom.screenShareFailed");
  });

  it("ignores duplicate starts but permits stopping while a start is pending", async () => {
    const { result, setScreenShareEnabled } = setup();
    let finish!: () => void;
    setScreenShareEnabled.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = result.current(true);
    expect(await result.current(true)).toBe(false);
    expect(await result.current(false)).toBe(true);
    await act(async () => finish());
    expect(await pending).toBe(false);
    expect(setScreenShareEnabled).toHaveBeenCalledTimes(3);
    expect(setScreenShareEnabled).toHaveBeenLastCalledWith(false);
    expect(await result.current(true)).toBe(true);
  });
});
