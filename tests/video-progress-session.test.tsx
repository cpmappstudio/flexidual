import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import { observeVideoProgress } from "@/lib/observe-video-progress";
import { startVideoProgress as startSession } from "@/lib/video-progress-session";
import {
  addPlayedRange,
  coverageSize,
  hasCoverage,
  mergeCoverage,
  subtractCoverage,
  watchedMilliseconds,
} from "@/lib/video-progress";

const mocks = vi.hoisted(() => ({
  pending: new Map<string, ArrayBuffer>(),
  store: vi.fn(),
  playbackStore: vi.fn(),
  playback: new Map<
    string,
    import("@/lib/video-progress-storage").VideoPlaybackSnapshot
  >(),
}));
vi.mock("@/lib/video-progress-storage", () => ({
  updatePendingVideoProgress: (...args: unknown[]) => mocks.store(...args),
  readVideoPlayback: async (id: string) => mocks.playback.get(id),
  updateVideoPlayback: (...args: unknown[]) => mocks.playbackStore(...args),
}));
const DURATION = 120_000;
function startVideoProgress(
  video: HTMLVideoElement,
  options: Omit<Parameters<typeof startSession>[1], "storageKey"> & {
    storageKey?: string;
  },
) {
  return startSession(video, { storageKey: "learner-video", ...options });
}
const bits = (start: number, end: number) => {
  const result = new Uint8Array(coverageSize(DURATION));
  addPlayedRange(result, start, end, DURATION);
  return result;
};
function player(durationMs = DURATION) {
  const video = document.createElement("video");
  let paused = true;
  let ended = false;
  let ranges: [number, number][] = [];
  Object.defineProperties(video, {
    duration: { get: () => durationMs / 1000 },
    paused: { get: () => paused },
    ended: { get: () => ended },
    played: {
      get: () => ({
        length: ranges.length,
        start: (i: number) => ranges[i][0],
        end: (i: number) => ranges[i][1],
      }),
    },
  });
  return {
    video,
    play() {
      paused = false;
      ended = false;
      video.dispatchEvent(new Event("playing"));
    },
    advance(time: number, played: [number, number][] = [[0, time]]) {
      ranges = played;
      video.currentTime = time;
      video.dispatchEvent(new Event("timeupdate"));
    },
    pause() {
      paused = true;
      video.dispatchEvent(new Event("pause"));
    },
    seek(time: number) {
      video.currentTime = time;
      video.dispatchEvent(new Event("seeking"));
      video.dispatchEvent(new Event("seeked"));
    },
    finish(played: [number, number][]) {
      ranges = played;
      video.currentTime = durationMs / 1000;
      paused = true;
      ended = true;
      video.dispatchEvent(new Event("ended"));
    },
  };
}
function visibility(value: string) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}
function pip(video: HTMLVideoElement, enabled: boolean) {
  Object.defineProperty(document, "pictureInPictureElement", {
    configurable: true,
    value: enabled ? video : null,
  });
  video.dispatchEvent(
    new Event(enabled ? "enterpictureinpicture" : "leavepictureinpicture"),
  );
}
const settle = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.useFakeTimers();
  visibility("visible");
  Object.defineProperty(document, "pictureInPictureElement", {
    configurable: true,
    value: null,
  });
  mocks.pending.clear();
  mocks.playback.clear();
  mocks.playbackStore
    .mockReset()
    .mockImplementation(
      async (
        id: string,
        value: import("@/lib/video-progress-storage").VideoPlaybackSnapshot,
      ) => {
        mocks.playback.set(id, value);
      },
    );
  mocks.store
    .mockReset()
    .mockImplementation(
      async (
        id: string,
        incoming = new Uint8Array(),
        acknowledged = new Uint8Array(),
        previousId?: string,
      ) => {
        const next = subtractCoverage(
          mergeCoverage(
            mergeCoverage(
              new Uint8Array(mocks.pending.get(id) ?? new ArrayBuffer(0)),
              new Uint8Array(
                mocks.pending.get(previousId ?? "") ?? new ArrayBuffer(0),
              ),
            ),
            incoming,
          ),
          acknowledged,
        );
        mocks.pending.set(id, next.buffer);
        if (previousId && previousId !== id) mocks.pending.delete(previousId);
        return next;
      },
    );
});

test("failed initialization persists before receiving a server ID and reload recovers it without new playback", async () => {
  const p = player();
  const save = vi.fn(async (_: string, coverage: ArrayBuffer) => ({
    coverage,
  }));
  const stop = startVideoProgress(p.video, {
    storageKey: "stable-user-video",
    prepare: async () => {
      throw new Error("offline");
    },
    save,
    onPending: vi.fn(),
  });
  await settle();
  p.play();
  p.advance(20);
  stop();
  await settle();
  expect(save).not.toHaveBeenCalled();
  expect(
    watchedMilliseconds(
      new Uint8Array(mocks.pending.get("stable-user-video")!),
      DURATION,
    ),
  ).toBe(20_000);
  const reloaded = player();
  const stopReload = startVideoProgress(reloaded.video, {
    storageKey: "stable-user-video",
    prepare: async () => ({
      id: "new-server-id",
      durationMs: DURATION,
      coverage: bits(0, 0).buffer,
    }),
    save,
    onPending: vi.fn(),
  });
  await settle();
  stopReload();
  await settle();
  expect(save).toHaveBeenCalledWith("new-server-id", bits(0, 20_000).buffer);
  expect(
    new Uint8Array(mocks.pending.get("stable-user-video")!).some(Boolean),
  ).toBe(false);
});

test("migrates earlier server-ID pending data and isolates other users before initialization", async () => {
  mocks.pending.set("legacy-id", bits(10_000, 20_000).buffer);
  const first = player();
  const stop = startVideoProgress(first.video, {
    storageKey: "user-a",
    prepare: async () => ({
      id: "legacy-id",
      durationMs: DURATION,
      coverage: bits(0, 0).buffer,
    }),
    save: async (_id, coverage) => ({ coverage }),
    onPending: vi.fn(),
  });
  await settle();
  expect(mocks.pending.has("legacy-id")).toBe(false);
  expect(
    watchedMilliseconds(new Uint8Array(mocks.pending.get("user-a")!), DURATION),
  ).toBe(10_000);
  const second = player();
  const saveOther = vi.fn(async (_id: string, coverage: ArrayBuffer) => ({
    coverage,
  }));
  const stopOther = startVideoProgress(second.video, {
    storageKey: "user-b",
    prepare: async () => ({
      id: "other-id",
      durationMs: DURATION,
      coverage: bits(0, 0).buffer,
    }),
    save: saveOther,
    onPending: vi.fn(),
  });
  await settle();
  stopOther();
  await settle();
  expect(saveOther).not.toHaveBeenCalled();
  stop();
  await settle();
});

test("rate-limited preparation honors retryAfter while preserving visible playback locally", async () => {
  const p = player();
  const prepare = vi
    .fn()
    .mockRejectedValueOnce(
      new ConvexError({
        code: "VIDEO_PROGRESS_RATE_LIMITED",
        retryAfter: 30_000,
      }),
    )
    .mockResolvedValue({
      id: "server-id",
      durationMs: DURATION,
      coverage: bits(0, 0).buffer,
    });
  const save = vi.fn(async (_id: string, coverage: ArrayBuffer) => ({
    coverage,
  }));
  const stop = startVideoProgress(p.video, {
    storageKey: "stable-user-video",
    prepare,
    save,
    onPending: vi.fn(),
  });
  await settle();
  p.play();
  p.advance(20);
  p.pause();
  visibility("hidden");
  window.dispatchEvent(new Event("pagehide"));
  await settle();
  expect(prepare).toHaveBeenCalledTimes(1);
  visibility("visible");
  await vi.advanceTimersByTimeAsync(29_999);
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(
    watchedMilliseconds(
      new Uint8Array(mocks.pending.get("stable-user-video")!),
      DURATION,
    ),
  ).toBe(20_000);
  await vi.advanceTimersByTimeAsync(1);
  await settle();
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenCalledWith("server-id", bits(0, 20_000).buffer);
  stop();
  await settle();
});

test("checkpoint cooldown survives pause, visibility, periodic flush and close while retaining new coverage for reload", async () => {
  const p = player();
  const prepare = vi.fn(async () => ({
    id: "server-id",
    durationMs: DURATION,
    coverage: bits(0, 0).buffer,
  }));
  const save = vi
    .fn()
    .mockRejectedValueOnce(
      new ConvexError({
        code: "VIDEO_PROGRESS_RATE_LIMITED",
        retryAfter: 90_000,
      }),
    )
    .mockImplementation(async (_id: string, coverage: ArrayBuffer) => ({
      coverage,
    }));
  const stop = startVideoProgress(p.video, {
    prepare,
    save,
    onPending: vi.fn(),
  });
  await settle();
  p.play();
  p.advance(10);
  p.pause();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  p.play();
  p.advance(25);
  p.pause();
  visibility("hidden");
  window.dispatchEvent(new Event("pagehide"));
  await settle();
  await vi.advanceTimersByTimeAsync(60_000);
  stop();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(
    watchedMilliseconds(
      new Uint8Array(mocks.pending.get("learner-video")!),
      DURATION,
    ),
  ).toBe(25_000);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(save).toHaveBeenCalledTimes(1);
  visibility("visible");
  const reloaded = player();
  const stopReload = startVideoProgress(reloaded.video, {
    prepare,
    save,
    onPending: vi.fn(),
  });
  await settle();
  stopReload();
  await settle();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith("server-id", bits(0, 25_000).buffer);
  expect(
    new Uint8Array(mocks.pending.get("learner-video")!).some(Boolean),
  ).toBe(false);
});
test.each(["prepare", "save"] as const)(
  "close with full storage retains a bounded final retry after rate-limited %s",
  async (failure) => {
    mocks.store.mockRejectedValue(
      new DOMException("Full", "QuotaExceededError"),
    );
    const p = player();
    const target = {
      id: "server-id",
      durationMs: DURATION,
      coverage: bits(0, 0).buffer,
    };
    const limited = new ConvexError({
      code: "VIDEO_PROGRESS_RATE_LIMITED",
      retryAfter: 30_000,
    });
    const prepare = vi.fn().mockResolvedValue(target);
    const save = vi.fn(async (_id: string, coverage: ArrayBuffer) => ({
      coverage,
    }));
    if (failure === "prepare") prepare.mockRejectedValueOnce(limited);
    else save.mockRejectedValueOnce(limited);
    const stop = startVideoProgress(p.video, {
      prepare,
      save,
      onPending: vi.fn(),
    });
    await settle();
    p.play();
    p.advance(10);
    p.pause();
    await settle();
    p.play();
    p.advance(25);
    stop();
    await settle();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(failure === "prepare" ? 0 : 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenLastCalledWith("server-id", bits(0, 25_000).buffer);
    expect(save).toHaveBeenCalledTimes(failure === "prepare" ? 1 : 2);
    expect(vi.getTimerCount()).toBe(0);
  },
);

test.each(["offline", "identity", "permission"] as const)(
  "closed memory-only finalization is bounded and stops on %s",
  async (failure) => {
    mocks.store.mockRejectedValue(
      new DOMException("Full", "QuotaExceededError"),
    );
    const p = player();
    let current = true;
    const save = vi.fn().mockRejectedValue(new Error("offline"));
    const stop = startVideoProgress(p.video, {
      prepare: async () => ({
        id: "server-id",
        durationMs: DURATION,
        coverage: bits(0, 0).buffer,
      }),
      save,
      onPending: vi.fn(),
      isCurrent: () => current,
    });
    await settle();
    p.play();
    p.advance(25);
    p.pause();
    await settle();
    stop();
    await settle();
    if (failure === "identity") current = false;
    if (failure === "permission")
      save.mockRejectedValue(new ConvexError("PERMISSION_DENIED"));
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(save).toHaveBeenCalledTimes(
      failure === "identity" ? 1 : failure === "permission" ? 2 : 4,
    );
    expect(vi.getTimerCount()).toBe(0);
  },
);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("visible playback and PiP count; hidden playback, seeking and rewatching do not inflate coverage", () => {
  const p = player();
  let coverage: Uint8Array = bits(0, 0);
  const stop = observeVideoProgress(
    p.video,
    (next) => {
      coverage = next;
    },
    vi.fn(),
  );
  p.play();
  p.advance(10);
  visibility("hidden");
  p.advance(30);
  visibility("visible");
  p.advance(40);
  p.seek(80);
  p.advance(90, [
    [0, 40],
    [80, 90],
  ]);
  visibility("hidden");
  pip(p.video, true);
  p.advance(100, [
    [0, 40],
    [80, 100],
  ]);
  pip(p.video, false);
  p.advance(110, [
    [0, 40],
    [80, 110],
  ]);
  visibility("visible");
  p.seek(0);
  p.advance(10, [
    [0, 40],
    [80, 110],
  ]);
  stop();
  expect(watchedMilliseconds(coverage, DURATION)).toBe(40_000);
});

test("waiting and pause stop collection until playback resumes; downloaded ranges never count", () => {
  const p = player();
  let coverage: Uint8Array = bits(0, 0);
  const stop = observeVideoProgress(
    p.video,
    (next) => {
      coverage = next;
    },
    vi.fn(),
  );
  p.play();
  p.advance(5);
  p.video.dispatchEvent(new Event("waiting"));
  p.advance(20);
  p.play();
  p.advance(30);
  p.pause();
  p.advance(40);
  stop();
  expect(watchedMilliseconds(coverage, DURATION)).toBe(15_000);
});

test("a minute of continuous playback batches one checkpoint rather than writing on every timeupdate", async () => {
  const p = player();
  const save = vi.fn(async (_: string, coverage: ArrayBuffer) => ({
    coverage,
  }));
  const stop = startVideoProgress(p.video, {
    prepare: async () => ({
      id: "learner-video",
      durationMs: DURATION,
      coverage: bits(0, 0).buffer,
    }),
    save,
    onPending: vi.fn(),
  });
  await settle();
  p.play();
  for (let time = 0.25; time <= 60; time += 0.25) {
    p.advance(time);
    await vi.advanceTimersByTimeAsync(250);
  }
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(
    watchedMilliseconds(new Uint8Array(save.mock.calls[0][1]), DURATION),
  ).toBe(60_000);
  stop();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
});

test("close before metadata returns still saves the final visible snapshot", async () => {
  const p = player();
  let ready!: (value: {
    id: string;
    durationMs: number;
    coverage: ArrayBuffer;
  }) => void;
  const prepare = new Promise<{
    id: string;
    durationMs: number;
    coverage: ArrayBuffer;
  }>((resolve) => {
    ready = resolve;
  });
  const save = vi.fn(async (_: string, coverage: ArrayBuffer) => ({
    coverage,
  }));
  const stop = startVideoProgress(p.video, {
    prepare: () => prepare,
    save,
    onPending: vi.fn(),
  });
  p.play();
  p.advance(15);
  stop();
  ready({
    id: "learner-video",
    durationMs: DURATION,
    coverage: bits(0, 0).buffer,
  });
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(
    watchedMilliseconds(new Uint8Array(save.mock.calls[0][1]), DURATION),
  ).toBe(15_000);
});

test("new progress during a delayed checkpoint is retained and flushed on close", async () => {
  const p = player();
  let confirm!: (value: { coverage: ArrayBuffer }) => void;
  const first = new Promise<{ coverage: ArrayBuffer }>((resolve) => {
    confirm = resolve;
  });
  const save = vi
    .fn()
    .mockReturnValueOnce(first)
    .mockImplementation(async (_: string, coverage: ArrayBuffer) => ({
      coverage,
    }));
  const stop = startVideoProgress(p.video, {
    prepare: async () => ({
      id: "learner-video",
      durationMs: DURATION,
      coverage: bits(0, 0).buffer,
    }),
    save,
    onPending: vi.fn(),
  });
  await settle();
  p.play();
  p.advance(10);
  p.pause();
  await settle();
  p.play();
  p.advance(25);
  stop();
  confirm({ coverage: bits(0, 10_000).buffer });
  await settle();
  expect(save).toHaveBeenCalledTimes(2);
  expect(
    watchedMilliseconds(new Uint8Array(save.mock.calls[1][1]), DURATION),
  ).toBe(15_000);
});

test("temporary network failure retries the same coverage and reload recovers pending data without new playback", async () => {
  const p = player();
  const prepare = async () => ({
    id: "learner-video",
    durationMs: DURATION,
    coverage: bits(0, 0).buffer,
  });
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation(async (_: string, coverage: ArrayBuffer) => ({
      coverage,
    }));
  const stop = startVideoProgress(p.video, {
    prepare,
    save,
    onPending: vi.fn(),
  });
  await settle();
  p.play();
  p.advance(12);
  p.pause();
  await settle();
  await vi.advanceTimersByTimeAsync(5000);
  expect(save).toHaveBeenCalledTimes(2);
  expect(new Uint8Array(save.mock.calls[0][1])).toEqual(
    new Uint8Array(save.mock.calls[1][1]),
  );
  stop();
  await settle();
  mocks.pending.set("learner-video", bits(20_000, 30_000).buffer);
  const reloaded = player();
  const stopReload = startVideoProgress(reloaded.video, {
    prepare,
    save,
    onPending: vi.fn(),
  });
  await settle();
  stopReload();
  await settle();
  expect(
    watchedMilliseconds(new Uint8Array(save.mock.calls.at(-1)![1]), DURATION),
  ).toBe(10_000);
});

test("storage full does not prevent online saving, and revoked permission stops retrying", async () => {
  mocks.store.mockRejectedValue(new DOMException("Full", "QuotaExceededError"));
  const p = player();
  const status = vi.fn();
  const save = vi.fn(async (_: string, coverage: ArrayBuffer) => ({
    coverage,
  }));
  const stop = startVideoProgress(p.video, {
    prepare: async () => ({
      id: "learner-video",
      durationMs: DURATION,
      coverage: bits(0, 0).buffer,
    }),
    save,
    onPending: status,
  });
  await settle();
  p.play();
  p.advance(10);
  p.pause();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(status).toHaveBeenLastCalledWith(false);
  save.mockRejectedValue(new ConvexError("PERMISSION_DENIED"));
  p.play();
  p.advance(20);
  p.pause();
  await settle();
  await vi.advanceTimersByTimeAsync(300_000);
  expect(save).toHaveBeenCalledTimes(2);
  stop();
  await settle();
});

test.each(["prepare", "save"] as const)(
  "terminal denial during %s stops retries with the same identity and retains pending coverage for an authorized reopen",
  async (stage) => {
    const p = player();
    const denied = new ConvexError("PERMISSION_DENIED");
    const target = {
      id: "learner-video",
      durationMs: DURATION,
      coverage: bits(0, 0).buffer,
    };
    const prepare = vi.fn().mockImplementation(async () => {
      if (stage === "prepare") throw denied;
      return target;
    });
    const save = vi.fn().mockRejectedValue(denied);
    const stop = startVideoProgress(p.video, {
      prepare,
      save,
      onPending: vi.fn(),
      isCurrent: () => true,
    });
    await settle();
    p.play();
    p.advance(10);
    p.pause();
    await settle();
    p.play();
    p.advance(20);
    p.pause();
    await settle();
    await vi.advanceTimersByTimeAsync(300_000);
    stop();
    await settle();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(stage === "save" ? 1 : 0);
    expect(vi.getTimerCount()).toBe(0);
    expect(
      watchedMilliseconds(
        new Uint8Array(mocks.pending.get("learner-video")!),
        DURATION,
      ),
    ).toBe(20_000);

    const reloaded = player();
    prepare.mockResolvedValue(target);
    save.mockImplementation(async (_id: string, coverage: ArrayBuffer) => ({
      coverage,
    }));
    const stopReload = startVideoProgress(reloaded.video, {
      prepare,
      save,
      onPending: vi.fn(),
    });
    await settle();
    reloaded.pause();
    await settle();
    expect(save).toHaveBeenLastCalledWith(
      "learner-video",
      bits(0, 20_000).buffer,
    );
    expect(
      new Uint8Array(mocks.pending.get("learner-video")!).some(Boolean),
    ).toBe(false);
    stopReload();
    await settle();
  },
);

test("late preparation after changing accounts never sends the previous learner's playback", async () => {
  const p = player();
  let current = true;
  let ready!: (value: {
    id: string;
    durationMs: number;
    coverage: ArrayBuffer;
  }) => void;
  const pending = new Promise<{
    id: string;
    durationMs: number;
    coverage: ArrayBuffer;
  }>((resolve) => {
    ready = resolve;
  });
  const save = vi.fn();
  const stop = startVideoProgress(p.video, {
    prepare: () => pending,
    save,
    onPending: vi.fn(),
    isCurrent: () => current,
  });
  p.play();
  p.advance(20);
  current = false;
  stop();
  ready({
    id: "other-account",
    durationMs: DURATION,
    coverage: bits(0, 0).buffer,
  });
  await settle();
  expect(save).not.toHaveBeenCalled();
  expect(mocks.pending.has("other-account")).toBe(false);
});

test("Safari's native PiP mode counts while hidden and stops after leaving PiP", () => {
  const p = player();
  let mode = "inline";
  Object.defineProperty(p.video, "webkitPresentationMode", { get: () => mode });
  let coverage: Uint8Array = bits(0, 0);
  const stop = observeVideoProgress(
    p.video,
    (next) => {
      coverage = next;
    },
    vi.fn(),
  );
  p.play();
  p.advance(5);
  visibility("hidden");
  p.advance(10);
  mode = "picture-in-picture";
  p.video.dispatchEvent(new Event("webkitpresentationmodechanged"));
  p.advance(20);
  mode = "inline";
  p.video.dispatchEvent(new Event("webkitpresentationmodechanged"));
  p.advance(30);
  stop();
  expect(watchedMilliseconds(coverage, DURATION)).toBe(15_000);
});

test("small native duration differences do not grow coverage past the verified duration", async () => {
  const p = player();
  const save = vi.fn(async (_: string, coverage: ArrayBuffer) => ({
    coverage,
  }));
  const stop = startVideoProgress(p.video, {
    prepare: async () => ({
      id: "learner-video",
      durationMs: 119_900,
      coverage: new ArrayBuffer(15),
    }),
    save,
    onPending: vi.fn(),
  });
  await settle();
  p.play();
  p.advance(120);
  p.pause();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(new Uint8Array(save.mock.calls[0][1])).toHaveLength(15);
  stop();
  await settle();
});

test.each([
  [5000, 6001],
  [6001, 5000],
])(
  "a duration mismatch beyond the existing tolerance (%i / %i ms) never saves reconciled progress",
  async (nativeMs, verifiedMs) => {
    const p = player(nativeMs);
    const save = vi.fn();
    const prepare = vi.fn(async () => ({
      id: "learner-video",
      durationMs: verifiedMs,
      coverage: new ArrayBuffer(coverageSize(verifiedMs)),
    }));
    const stop = startVideoProgress(p.video, {
      prepare,
      save,
      onPending: vi.fn(),
    });
    await settle();
    p.play();
    p.advance(nativeMs / 1000);
    p.finish([[0, nativeMs / 1000]]);
    stop();
    await settle();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  },
);

test.each([
  [5000, 5879],
  [5879, 5000],
  [8000, 8001],
  [5200, 6100],
  [5000, 6000],
])(
  "native %i ms and verified %i ms complete without losing the metadata tail",
  async (nativeMs, verifiedMs) => {
    for (const mode of ["ready", "late", "quota"] as const) {
      mocks.pending.clear();
      if (mode === "quota")
        mocks.store.mockRejectedValue(
          new DOMException("Full", "QuotaExceededError"),
        );
      const p = player(nativeMs);
      let server = new Uint8Array(coverageSize(verifiedMs));
      const ready = Promise.withResolvers<{
        id: string;
        durationMs: number;
        coverage: ArrayBuffer;
      }>();
      const target = {
        id: "learner-video",
        durationMs: verifiedMs,
        coverage: server.slice().buffer,
      };
      const save = vi.fn(async (_: string, coverage: ArrayBuffer) => {
        server = mergeCoverage(server, new Uint8Array(coverage));
        return { coverage: server.slice().buffer };
      });
      const stop = startVideoProgress(p.video, {
        prepare: () =>
          mode === "late" ? ready.promise : Promise.resolve(target),
        save,
        onPending: vi.fn(),
      });
      if (mode !== "late") await settle();
      p.play();
      p.advance(nativeMs / 1000 - 0.001);
      p.pause();
      p.finish([[0, nativeMs / 1000]]);
      stop();
      ready.resolve(target);
      await settle();
      expect(watchedMilliseconds(server, verifiedMs)).toBe(verifiedMs);
      expect(save.mock.calls.length).toBeGreaterThan(0);
      expect(save.mock.calls.length).toBeLessThanOrEqual(2);
      expect(
        save.mock.calls.every(
          ([, bits]) => bits.byteLength === coverageSize(verifiedMs),
        ),
      ).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    }
  },
);

test.each(["seek", "hidden", "gap", "pip"] as const)(
  "metadata tail reconciliation preserves the %s eligibility rules and internal gaps",
  async (scenario) => {
    const p = player(5000);
    let server = new Uint8Array(coverageSize(5879));
    const stop = startVideoProgress(p.video, {
      prepare: async () => ({
        id: "learner-video",
        durationMs: 5879,
        coverage: server.slice().buffer,
      }),
      save: async (_id, bits) => {
        server = mergeCoverage(server, new Uint8Array(bits));
        return { coverage: server.slice().buffer };
      },
      onPending: vi.fn(),
    });
    await settle();
    p.play();
    p.advance(1);
    if (scenario === "seek") p.seek(5);
    if (scenario === "hidden" || scenario === "pip") visibility("hidden");
    if (scenario === "pip") pip(p.video, true);
    if (scenario === "gap") {
      p.seek(4);
      p.advance(5, [
        [0, 1],
        [4, 5],
      ]);
    } else if (scenario !== "seek") p.advance(5);
    p.finish(
      scenario === "seek"
        ? [[0, 1]]
        : scenario === "gap"
          ? [
              [0, 1],
              [4, 5],
            ]
          : [[0, 5]],
    );
    stop();
    await settle();
    expect(watchedMilliseconds(server, 5879)).toBe(
      scenario === "pip" ? 5879 : scenario === "gap" ? 2879 : 1000,
    );
  },
);

test("legacy progress pointing at native EOF replays the last real cell and completes once, without extra writes on replay", async () => {
  let server = new Uint8Array(coverageSize(5879));
  addPlayedRange(server, 0, 5000, 5879);
  const prepare = async () => ({
    id: "learner-video",
    durationMs: 5879,
    coverage: server.slice().buffer,
  });
  const save = vi.fn(async (_: string, bits: ArrayBuffer) => {
    server = mergeCoverage(server, new Uint8Array(bits));
    return { coverage: server.slice().buffer };
  });
  const p = player(5000);
  const stop = startVideoProgress(p.video, {
    prepare,
    save,
    onPending: vi.fn(),
  });
  await settle();
  expect(p.video.currentTime).toBe(4);
  p.play();
  p.advance(5, [[4, 5]]);
  p.finish([[4, 5]]);
  stop();
  await settle();
  expect(watchedMilliseconds(server, 5879)).toBe(5879);
  expect(save).toHaveBeenCalledTimes(1);
  const replay = player(5000);
  const stopReplay = startVideoProgress(replay.video, {
    prepare,
    save,
    onPending: vi.fn(),
  });
  await settle();
  expect(replay.video.currentTime).toBe(0);
  replay.play();
  replay.advance(5);
  replay.finish([[0, 5]]);
  stopReplay();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
});

test("a final metadata tail waits for the in-flight pause checkpoint instead of being lost until another interaction", async () => {
  const p = player(5000);
  const first = Promise.withResolvers<{ coverage: ArrayBuffer }>();
  const save = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockImplementation(async (_: string, coverage: ArrayBuffer) => ({
      coverage,
    }));
  const stop = startVideoProgress(p.video, {
    prepare: async () => ({
      id: "learner-video",
      durationMs: 5879,
      coverage: new ArrayBuffer(1),
    }),
    save,
    onPending: vi.fn(),
  });
  await settle();
  p.play();
  p.advance(5);
  p.pause();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  p.finish([[0, 5]]);
  first.resolve({ coverage: new Uint8Array([31]).buffer });
  await settle();
  expect(save).toHaveBeenCalledTimes(2);
  expect(watchedMilliseconds(new Uint8Array(save.mock.calls[1][1]), 5879)).toBe(
    879,
  );
  stop();
  await settle();
  expect(save).toHaveBeenCalledTimes(2);
});

test("fractional edges survive pauses and buffering without crediting repeated fragments", () => {
  const p = player();
  let coverage: Uint8Array = bits(0, 0);
  const stop = observeVideoProgress(
    p.video,
    (next) => {
      coverage = next;
    },
    vi.fn(),
  );
  p.play();
  p.advance(10.25);
  p.pause();
  p.play();
  p.advance(20.6);
  p.video.dispatchEvent(new Event("waiting"));
  p.play();
  p.advance(30);
  expect(watchedMilliseconds(coverage, DURATION)).toBe(30_000);
  for (let i = 0; i < 10; i++) {
    p.seek(30);
    p.advance(30.4, [[0, 30.4]]);
  }
  expect(watchedMilliseconds(coverage, DURATION)).toBe(30_000);
  p.advance(31, [[0, 31]]);
  expect(watchedMilliseconds(coverage, DURATION)).toBe(31_000);
  stop();
});

test("a delayed native playing event does not discard the start of visible playback", () => {
  const p = player();
  let coverage: Uint8Array = bits(0, 0);
  const stop = observeVideoProgress(
    p.video,
    (next) => {
      coverage = next;
    },
    vi.fn(),
  );
  p.video.currentTime = 0.01;
  p.play();
  p.advance(2.25);
  p.pause();
  p.video.currentTime = 2.26;
  p.play();
  p.advance(5);
  stop();
  expect(watchedMilliseconds(coverage, DURATION)).toBe(5000);
});

test("fractional gaps from hidden playback or seeking are not filled by rounding", () => {
  const p = player();
  let coverage: Uint8Array = bits(0, 0);
  const stop = observeVideoProgress(
    p.video,
    (next) => {
      coverage = next;
    },
    vi.fn(),
  );
  p.play();
  p.advance(10.25);
  visibility("hidden");
  p.advance(10.5);
  visibility("visible");
  p.advance(20.25);
  p.seek(20.5);
  p.advance(30, [
    [0, 20.25],
    [20.5, 30],
  ]);
  stop();
  expect(watchedMilliseconds(coverage, DURATION)).toBe(28_000);
});

test("native ended after pause credits the final fractional second, but seeking to the end or hidden ending does not", () => {
  for (const scenario of ["watched", "seek", "hidden"] as const) {
    visibility("visible");
    const p = player(5879);
    let coverage: Uint8Array = new Uint8Array(coverageSize(5879));
    const stop = observeVideoProgress(
      p.video,
      (next) => {
        coverage = next;
      },
      vi.fn(),
    );
    p.play();
    p.advance(scenario === "seek" ? 1 : 5.878);
    p.pause();
    expect(watchedMilliseconds(coverage, 5879)).toBe(
      scenario === "seek" ? 1000 : 5000,
    );
    if (scenario === "seek") p.seek(5.879);
    if (scenario === "hidden") visibility("hidden");
    p.finish(scenario === "seek" ? [[0, 1]] : [[0, 5.879]]);
    expect(watchedMilliseconds(coverage, 5879)).toBe(
      scenario === "watched" ? 5879 : scenario === "seek" ? 1000 : 5000,
    );
    stop();
  }
});

test("three reopenings resume from confirmed or recovered pending coverage and accumulate only unseen seconds", async () => {
  let server = bits(0, 0);
  const prepare = vi.fn(async () => ({
    id: "learner-video",
    durationMs: DURATION,
    coverage: server.slice().buffer,
  }));
  const save = vi.fn(async (_: string, coverage: ArrayBuffer) => {
    server = mergeCoverage(server, new Uint8Array(coverage));
    return { coverage: server.slice().buffer };
  });
  for (const [expectedStart, end] of [
    [0, 10.25],
    [10, 80.6],
    [80, 120],
  ]) {
    const p = player();
    const stop = startVideoProgress(p.video, {
      prepare,
      save,
      onPending: vi.fn(),
    });
    await settle();
    expect(p.video.currentTime).toBe(expectedStart);
    p.play();
    p.advance(end, [[expectedStart, end]]);
    p.pause();
    stop();
    await settle();
  }
  expect(watchedMilliseconds(server, DURATION)).toBe(DURATION);
  expect(save).toHaveBeenCalledTimes(3);
  expect(prepare).toHaveBeenCalledTimes(3);
  const replay = player();
  const stopReplay = startVideoProgress(replay.video, {
    prepare,
    save,
    onPending: vi.fn(),
  });
  await settle();
  expect(replay.video.currentTime).toBe(0);
  replay.play();
  replay.advance(12);
  stopReplay();
  await settle();
  expect(save).toHaveBeenCalledTimes(3);
});

test("resume combines server coverage and durable pending data, including when local storage is full", async () => {
  for (const storageFull of [false, true]) {
    mocks.pending.clear();
    if (storageFull)
      mocks.store
        .mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"))
        .mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
    else mocks.pending.set("learner-video", bits(10_000, 20_000).buffer);
    const p = player();
    const save = vi.fn(async (_: string, coverage: ArrayBuffer) => ({
      coverage: mergeCoverage(bits(0, 10_000), new Uint8Array(coverage)).buffer,
    }));
    const stop = startVideoProgress(p.video, {
      prepare: async () => ({
        id: "learner-video",
        durationMs: DURATION,
        coverage: bits(0, 10_000).buffer,
      }),
      save,
      onPending: vi.fn(),
    });
    await settle();
    expect(p.video.currentTime).toBe(storageFull ? 10 : 20);
    p.play();
    p.advance(30, [[storageFull ? 10 : 20, 30]]);
    stop();
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      watchedMilliseconds(new Uint8Array(save.mock.calls[0][1]), DURATION),
    ).toBe(20_000);
  }
});

test.each(["seek", "play", "close", "identity", "renewal"] as const)(
  "late preparation never overrides %s",
  async (scenario) => {
    const p = player();
    const ready = Promise.withResolvers<{
      id: string;
      durationMs: number;
      coverage: ArrayBuffer;
    }>();
    let current = true;
    const stop = startVideoProgress(p.video, {
      prepare: () => ready.promise,
      save: vi.fn(),
      onPending: vi.fn(),
      isCurrent: () => current,
      resumeFromProgress: scenario !== "renewal",
    });
    if (scenario === "seek") {
      p.seek(0);
    }
    if (scenario === "play") {
      p.play();
      p.pause();
    }
    if (scenario === "close") stop();
    if (scenario === "identity") current = false;
    ready.resolve({
      id: "learner-video",
      durationMs: DURATION,
      coverage: bits(0, 20_000).buffer,
    });
    await settle();
    expect(p.video.currentTime).toBe(0);
    if (scenario !== "close") stop();
    await settle();
  },
);

test("bookmark resumes a rewind, rejects forward gaps, and repeated coverage adds no writes", async () => {
  const coverage = bits(0, 80_000);
  const save = vi.fn(async (_id: string, coverage: ArrayBuffer) => ({
    coverage,
  }));
  const options = {
    prepare: async () => ({
      id: "progress",
      durationMs: DURATION,
      coverage: coverage.buffer,
    }),
    save,
    onPending: vi.fn(),
  };
  const first = player();
  const close = startVideoProgress(first.video, options);
  await settle();
  expect(first.video.currentTime).toBe(80);
  first.seek(35.25);
  first.play();
  first.advance(40, [[35.25, 40]]);
  first.pause();
  close();
  await settle();
  expect(save).not.toHaveBeenCalled();
  expect(mocks.playback.get("learner-video")?.positionMs).toBe(40_000);

  const second = player();
  const closeSecond = startVideoProgress(second.video, options);
  await settle();
  expect(second.video.currentTime).toBe(40);
  second.seek(110);
  expect(second.video.currentTime).toBe(80);
  second.seek(20);
  expect(second.video.currentTime).toBe(20);
  closeSecond();
  await settle();
  expect(save).not.toHaveBeenCalled();
});

test("an old gap clamps a later bookmark, filling it unlocks existing later coverage", async () => {
  const coverage = mergeCoverage(bits(0, 10_000), bits(12_000, 120_000));
  mocks.playback.set("learner-video", {
    coverage: coverage.buffer,
    durationMs: DURATION,
    positionMs: 115_000,
    updatedAt: Date.now(),
  });
  const save = vi.fn(async (_id: string, next: ArrayBuffer) => ({
    coverage: mergeCoverage(coverage, new Uint8Array(next)).buffer,
  }));
  const p = player();
  const close = startVideoProgress(p.video, {
    prepare: async () => ({
      id: "progress",
      durationMs: DURATION,
      coverage: coverage.buffer,
    }),
    save,
    onPending: vi.fn(),
  });
  await settle();
  expect(p.video.currentTime).toBe(10);
  p.play();
  p.advance(12, [[10, 12]]);
  p.seek(110);
  expect(p.video.currentTime).toBe(110);
  close();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(
    watchedMilliseconds(new Uint8Array(save.mock.calls[0][1]), DURATION),
  ).toBe(2000);
});

test("completed video remembers rewinds but reopening at EOF starts a replay", async () => {
  const coverage = bits(0, DURATION);
  const options = {
    prepare: async () => ({
      id: "progress",
      durationMs: DURATION,
      coverage: coverage.buffer,
    }),
    save: vi.fn(),
    onPending: vi.fn(),
  };
  for (const [positionMs, expected] of [
    [45_500, 45.5],
    [DURATION, 0],
  ]) {
    mocks.playback.set("learner-video", {
      coverage: coverage.buffer,
      durationMs: DURATION,
      positionMs,
      updatedAt: Date.now(),
    });
    const p = player();
    const close = startVideoProgress(p.video, options);
    await settle();
    expect(p.video.currentTime).toBe(expected);
    p.seek(119);
    expect(p.video.currentTime).toBe(119);
    close();
    await settle();
  }
  expect(options.save).not.toHaveBeenCalled();
});

test("stalled preparation releases controls once and a late response cannot reposition fallback playback", async () => {
  const preparation =
    Promise.withResolvers<
      import("@/lib/video-progress-session").VideoProgressTarget
    >();
  const onReady = vi.fn();
  const p = player();
  const close = startVideoProgress(p.video, {
    prepare: () => preparation.promise,
    save: vi.fn(),
    onPending: vi.fn(),
    onReady,
  });
  await settle();
  expect(onReady).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(8000);
  expect(onReady).toHaveBeenCalledTimes(1);
  p.play();
  p.advance(3);
  preparation.resolve({
    id: "progress",
    durationMs: DURATION,
    coverage: bits(0, 80_000).buffer,
  });
  await settle();
  expect(p.video.currentTime).toBe(3);
  expect(onReady).toHaveBeenCalledTimes(1);
  close();
  await settle();
});

test("offline reopening uses cached coverage for navigation without reuploading acknowledged bits", async () => {
  mocks.playback.set("learner-video", {
    coverage: bits(0, 80_000).buffer,
    durationMs: DURATION,
    positionMs: 30_250,
    updatedAt: Date.now(),
  });
  const p = player();
  const save = vi.fn();
  const close = startVideoProgress(p.video, {
    prepare: async () => {
      throw new Error("offline");
    },
    save,
    onPending: vi.fn(),
  });
  await settle();
  expect(p.video.currentTime).toBe(30.25);
  p.seek(90);
  expect(p.video.currentTime).toBe(80);
  close();
  await settle();
  expect(
    hasCoverage(
      new Uint8Array(mocks.pending.get("learner-video") ?? new ArrayBuffer(0)),
    ),
  ).toBe(false);
  expect(save).not.toHaveBeenCalled();
});

test("bookmark quota failure does not trigger extra final network retries when pending coverage is durable", async () => {
  mocks.playbackStore.mockRejectedValue(
    new DOMException("Full", "QuotaExceededError"),
  );
  const p = player();
  const prepare = vi.fn().mockRejectedValue(new Error("offline"));
  const close = startVideoProgress(p.video, {
    prepare,
    save: vi.fn(),
    onPending: vi.fn(),
  });
  await settle();
  p.play();
  p.advance(10);
  close();
  await settle();
  expect(
    watchedMilliseconds(
      new Uint8Array(mocks.pending.get("learner-video")!),
      DURATION,
    ),
  ).toBe(10_000);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(prepare).toHaveBeenCalledTimes(1);
});

test("failed preparation waits for existing outbox recovery before selecting a resume position", async () => {
  mocks.pending.set("learner-video", bits(0, 20_000).buffer);
  const p = player();
  const close = startVideoProgress(p.video, {
    prepare: async () => {
      throw new Error("offline");
    },
    save: vi.fn(),
    onPending: vi.fn(),
  });
  await settle();
  expect(p.video.currentTime).toBe(20);
  close();
  await settle();
});

test("hiding captures the exact playhead at the existing checkpoint without another write", async () => {
  const p = player();
  const save = vi.fn(async (_id: string, coverage: ArrayBuffer) => ({
    coverage,
  }));
  const close = startVideoProgress(p.video, {
    prepare: async () => ({
      id: "progress",
      durationMs: DURATION,
      coverage: bits(0, 0).buffer,
    }),
    save,
    onPending: vi.fn(),
  });
  await settle();
  p.play();
  p.advance(10);
  p.video.currentTime = 10.25;
  visibility("hidden");
  await settle();
  expect(mocks.playback.get("learner-video")?.positionMs).toBe(10_250);
  expect(save).toHaveBeenCalledTimes(1);
  close();
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
});

test.each(["confirmed", "pending", "offline"] as const)(
  "closing before preparation finishes does not create a zero bookmark (%s recovery)",
  async (mode) => {
    let confirmed = bits(0, 80_000);
    if (mode !== "confirmed")
      mocks.pending.set("learner-video", bits(80_000, 90_000).buffer);
    const preparation =
      Promise.withResolvers<
        import("@/lib/video-progress-session").VideoProgressTarget
      >();
    const save = vi.fn(async (_id: string, incoming: ArrayBuffer) => {
      confirmed = mergeCoverage(confirmed, new Uint8Array(incoming));
      return { coverage: confirmed.buffer };
    });
    const initial = player();
    const close = startVideoProgress(initial.video, {
      prepare: () => preparation.promise,
      save,
      onPending: vi.fn(),
    });
    await settle();
    close();
    preparation.resolve({
      id: "progress",
      durationMs: DURATION,
      coverage: confirmed.buffer,
    });
    await settle();
    // Coverage snapshots are useful, but timestamp zero is not a user bookmark.
    expect(mocks.playback.get("learner-video")?.updatedAt).toBe(0);
    const reopened = player();
    const closeReopened = startVideoProgress(reopened.video, {
      prepare: async () => {
        if (mode === "offline") throw new Error("offline");
        return {
          id: "progress",
          durationMs: DURATION,
          coverage: confirmed.buffer,
        };
      },
      save,
      onPending: vi.fn(),
    });
    await settle();
    expect(reopened.video.currentTime).toBe(mode === "confirmed" ? 80 : 90);
    closeReopened();
    await settle();
    expect(save).toHaveBeenCalledTimes(mode === "confirmed" ? 0 : 1);
  },
);

test("an intentional rewind to zero remains a real bookmark", async () => {
  mocks.playback.set("learner-video", {
    coverage: bits(0, 80_000).buffer,
    durationMs: DURATION,
    positionMs: 0,
    updatedAt: Date.now(),
  });
  const p = player();
  const save = vi.fn();
  const close = startVideoProgress(p.video, {
    prepare: async () => ({
      id: "progress",
      durationMs: DURATION,
      coverage: bits(0, 80_000).buffer,
    }),
    save,
    onPending: vi.fn(),
  });
  await settle();
  expect(p.video.currentTime).toBe(0);
  close();
  await settle();
  expect(save).not.toHaveBeenCalled();
});
