import { afterEach, expect, it, vi } from "vitest";
import { LocalParticipant, Track } from "livekit-client";

afterEach(() => vi.unstubAllGlobals());

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
