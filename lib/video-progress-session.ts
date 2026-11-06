import { ConvexError } from "convex/values";
import { observeVideoProgress } from "./observe-video-progress";
import {
  updatePendingVideoProgress,
  updateVideoPlayback,
} from "./video-progress-storage";
import { videoPlaybackNavigation } from "./video-playback-navigation";
import {
  addPlayedRange,
  coverageSize,
  fitCoverage,
  hasCoverage,
  mergeCoverage,
  subtractCoverage,
  validCoverage,
  VIDEO_PROGRESS_INTERVAL_MS,
} from "./video-progress";

export type VideoProgressTarget = {
  id: string;
  durationMs: number;
  coverage: ArrayBuffer;
};

/** Owns only one active player; durable pending data survives the player's lifetime. */
export function startVideoProgress(
  video: HTMLVideoElement,
  {
    prepare,
    save,
    onPending,
    isCurrent = () => true,
    storageKey,
    resumeFromProgress = true,
    onReady = () => {},
  }: {
    prepare: () => Promise<VideoProgressTarget>;
    save: (
      id: string,
      coverage: ArrayBuffer,
    ) => Promise<{ coverage: ArrayBuffer }>;
    onPending: (pending: boolean) => void;
    isCurrent?: () => boolean;
    storageKey: string;
    resumeFromProgress?: boolean;
    onReady?: () => void;
  },
) {
  const nativeDurationMs = video.duration * 1000;
  let local = new Uint8Array(coverageSize(nativeDurationMs));
  let cached = new Uint8Array(local.length);
  let acknowledged = new Uint8Array(local.length);
  let target: VideoProgressTarget | undefined;
  let playedToEnd = false;
  let closed = false;
  let terminal = false;
  let preparing: Promise<void> | undefined;
  let sending: Promise<void> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryAt = 0;
  let finalRetries = 0;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const navigation = videoPlaybackNavigation(video, {
    storageKey,
    getCoverage: () => mergeCoverage(target ? acknowledged : cached, local),
    getDuration: () => target?.durationMs ?? nativeDurationMs,
    isCurrent,
    resume: resumeFromProgress,
    onReady,
    onCached: (coverage) => {
      cached = fitCoverage(coverage, nativeDurationMs);
    },
  });
  const status = (pending: boolean) => {
    if (!closed) onPending(pending);
  };
  const reconcile = (coverage: Uint8Array) => {
    const durationMs = target?.durationMs ?? nativeDurationMs;
    const result = fitCoverage(coverage, durationMs);
    // Keep the existing timeline and bitmap. Only reconcile the accepted metadata
    // tail after actual eligible playback reached the native end, never gaps.
    if (playedToEnd && target && durationMs > nativeDurationMs)
      addPlayedRange(result, nativeDurationMs, durationMs, durationMs);
    return result;
  };
  const scheduleRetry = () => {
    if (
      retry !== undefined ||
      terminal ||
      !isCurrent() ||
      (closed && finalRetries >= 3)
    )
      return;
    retry = setTimeout(
      () => {
        retry = undefined;
        if (closed) finalRetries++;
        void flush();
      },
      Math.max(0, retryAt - Date.now()),
    );
  };
  const fail = (error: unknown) => {
    status(true);
    const code = error instanceof ConvexError ? error.data : null;
    terminal =
      terminal ||
      code === "PERMISSION_DENIED" ||
      code === "VIDEO_PROGRESS_UNAVAILABLE" ||
      code === "INVALID_VIDEO_COVERAGE" ||
      code === "VIDEO_PROGRESS_DURATION_UNAVAILABLE";
    const retryAfter =
      code &&
      typeof code === "object" &&
      "retryAfter" in code &&
      typeof code.retryAfter === "number" &&
      Number.isFinite(code.retryAfter)
        ? Math.max(0, code.retryAfter)
        : 0;
    if (!terminal && retry === undefined) {
      const delay = Math.max(
        retryAfter,
        Math.min(300_000, 5000 * 3 ** Math.min(failures++, 4)),
      );
      retryAt = Date.now() + delay;
      if (!closed) scheduleRetry();
    }
  };
  const persist = async (previousId?: string) => {
    const snapshot = navigation.snapshot();
    try {
      const pending = await updatePendingVideoProgress(
        storageKey,
        subtractCoverage(local, acknowledged),
        acknowledged,
        previousId,
      );
      local = reconcile(mergeCoverage(local, pending));
      try {
        await updateVideoPlayback(storageKey, {
          ...snapshot,
          coverage: mergeCoverage(acknowledged, local).buffer,
        });
      } catch {
        // A failed bookmark must not turn a durable outbox into a failed checkpoint.
      }
      return true;
    } catch {
      // Quota/storage failure must not stop playback or online persistence.
      if (hasCoverage(subtractCoverage(local, acknowledged))) status(true);
      return false;
    }
  };
  const initialize = () => {
    preparing ??= prepare()
      .then(async (value) => {
        if (!isCurrent()) {
          terminal = true;
          return;
        }
        if (Math.abs(value.durationMs - video.duration * 1000) > 1000) {
          terminal = true;
          throw new Error(
            "Player duration differs from verified video metadata",
          );
        }
        target = value;
        local = reconcile(local);
        acknowledged = new Uint8Array(value.coverage);
        await persist(value.id);
        if (!closed && !terminal && isCurrent()) await navigation.start();
      })
      .catch((error) => {
        preparing = undefined;
        throw error;
      });
    return preparing;
  };
  async function flush() {
    if (terminal || !isCurrent()) return;
    if (sending) return sending;
    sending = (async () => {
      let persisted = false;
      try {
        persisted = await persist();
        // Boundaries still save locally, but never bypass the network cooldown.
        if (Date.now() < retryAt) return;
        await initialize();
        if (terminal || !isCurrent()) return;
        persisted = await persist();
        if (!isCurrent()) return;
        const pending = subtractCoverage(local, acknowledged);
        if (!target || !hasCoverage(pending)) {
          status(false);
          return;
        }
        if (!validCoverage(pending, target.durationMs))
          throw new Error("Invalid local video coverage");
        const response = await save(target.id, pending.buffer);
        acknowledged = mergeCoverage(
          acknowledged,
          new Uint8Array(response.coverage),
        );
        try {
          await updatePendingVideoProgress(
            storageKey,
            new Uint8Array(),
            acknowledged,
          );
        } catch {
          /* Server confirmation is durable even if local cleanup fails. */
        }
        failures = 0;
        retryAt = 0;
        clearTimeout(retry);
        retry = undefined;
        status(false);
      } catch (error) {
        fail(error);
      } finally {
        sending = undefined;
        if (
          closed &&
          !persisted &&
          hasCoverage(subtractCoverage(local, acknowledged))
        )
          scheduleRetry();
      }
    })();
    return sending;
  }
  const stop = observeVideoProgress(
    video,
    (coverage, ended) => {
      playedToEnd ||= ended;
      local = reconcile(mergeCoverage(local, coverage));
      if (!persistTimer)
        persistTimer = setTimeout(() => {
          persistTimer = undefined;
          void persist();
        }, 5000);
    },
    () => {
      // A pause checkpoint may still be in flight when ended adds the final tail.
      void (sending ?? Promise.resolve()).then(() => flush());
    },
  );
  const interval = setInterval(() => {
    void flush();
  }, VIDEO_PROGRESS_INTERVAL_MS);
  // The recovery key exists before the network returns a server progress ID.
  const recovery = persist();
  // Prepare once alongside media loading; navigation releases the controls after
  // restoration (or a bounded fallback), without blocking URL signing.
  void initialize()
    .then(() => {
      if (closed) void flush();
    })
    .catch(async (error) => {
      fail(error);
      await recovery;
      await navigation.start();
    });
  return () => {
    navigation.stop();
    closed = true;
    clearInterval(interval);
    clearTimeout(retry);
    retry = undefined;
    clearTimeout(persistTimer);
    stop();
    clearTimeout(persistTimer);
    if (terminal || !isCurrent()) void persist();
    // Capture later edits even when a previous checkpoint was in flight at close.
    void (sending ?? Promise.resolve()).then(() => flush());
  };
}
