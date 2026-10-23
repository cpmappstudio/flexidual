import { afterEach, expect, it, vi } from "vitest";
import {
  LocalParticipant,
  RemoteVideoTrack,
  Track,
  TrackEvent,
} from "livekit-client";

afterEach(() => vi.unstubAllGlobals());

it("the installed adaptive video SDK resizes, pauses hidden video and preserves PiP", async () => {
  vi.useFakeTimers();
  try {
    const track = new RemoteVideoTrack(
      { id: "camera" } as MediaStreamTrack,
      "TR_camera",
      {} as RTCRtpReceiver,
      { pixelDensity: 1 },
    );
    const visibility = vi.fn();
    const dimensions = vi.fn();
    track.on(TrackEvent.VisibilityChanged, visibility);
    track.on(TrackEvent.VideoDimensionsChanged, dimensions);
    let width = 320;
    const element: Parameters<typeof track.observeElementInfo>[0] = {
      element: document.createElement("video"),
      visible: true,
      pictureInPicture: false,
      visibilityChangedAt: 0,
      width: () => width,
      height: () => (width * 9) / 16,
      observe: vi.fn(),
      stopObserving: vi.fn(),
    };
    track.observeElementInfo(element);
    await vi.advanceTimersByTimeAsync(150);
    expect(dimensions).toHaveBeenLastCalledWith(
      { width: 320, height: 180 },
      track,
    );
    width = 1280;
    element.handleResize!();
    await vi.advanceTimersByTimeAsync(150);
    expect(dimensions).toHaveBeenLastCalledWith(
      { width: 1280, height: 720 },
      track,
    );
    element.visible = false;
    element.handleVisibilityChanged!();
    expect(visibility).toHaveBeenLastCalledWith(false, track);
    element.pictureInPicture = true;
    element.handleVisibilityChanged!();
    expect(visibility).toHaveBeenLastCalledWith(true, track);
    element.pictureInPicture = false;
    element.handleVisibilityChanged!();
    expect(visibility).toHaveBeenLastCalledWith(false, track);
    element.visible = true;
    element.handleVisibilityChanged!();
    expect(visibility).toHaveBeenLastCalledWith(true, track);
    track.stopObservingElementInfo(element);
    expect(element.stopObserving).toHaveBeenCalledOnce();
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

it("rejects the original publication error even if SDK sender cleanup throws", async () => {
  vi.stubGlobal("MediaStreamTrack", class {});
  const original = new Error("publication timed out");
  const cleanup = new DOMException(
    "sender belongs to the previous connection",
    "InvalidAccessError",
  );
  const participant = {
    hasPermissionsToPublish: () => true,
    trackPublications: new Map(),
    enabledPublishVideoCodecs: [],
    normalizeRequestedFrameMetadataOptions: () => [],
    log: { error: vi.fn() },
    engine: {
      addTrack: vi.fn().mockRejectedValue(original),
      pcManager: {
        publisher: {
          removeTrack: vi.fn(() => {
            throw cleanup;
          }),
        },
      },
      negotiate: vi.fn().mockResolvedValue(undefined),
    },
  };
  const track = {
    kind: Track.Kind.Audio,
    source: Track.Source.ScreenShareAudio,
    mediaStreamTrack: { id: "screen-audio" },
    sender: {},
    on: vi.fn(),
    getSourceTrackSettings: () => ({}),
  };
  // Exercise the installed SDK's failing publish branch, not a copy of its fix.
  await expect(
    Reflect.get(LocalParticipant.prototype, "publish").call(
      participant,
      track,
      {},
      false,
    ),
  ).rejects.toBe(original);
  expect(
    participant.engine.pcManager.publisher.removeTrack,
  ).toHaveBeenCalledWith(track.sender);
  expect(participant.engine.negotiate).toHaveBeenCalledTimes(1);
});
