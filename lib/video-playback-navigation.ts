import { firstUnwatchedMs, VIDEO_PROGRESS_CELL_MS } from "./video-progress";
import {
  readVideoPlayback,
  type VideoPlaybackSnapshot,
} from "./video-progress-storage";

/** Navigation preferences only. Watching evidence and server persistence stay in the session. */
export function videoPlaybackNavigation(
  video: HTMLVideoElement,
  {
    storageKey,
    getCoverage,
    getDuration,
    isCurrent,
    resume,
    onReady,
    onCached,
  }: {
    storageKey: string;
    getCoverage: () => Uint8Array;
    getDuration: () => number;
    isCurrent: () => boolean;
    resume: boolean;
    onReady: () => void;
    onCached: (coverage: Uint8Array) => void;
  },
) {
  let closed = false;
  let ready = false;
  let canResume = resume && video.paused && video.currentTime === 0;
  let bookmark: VideoPlaybackSnapshot | undefined;
  let positionMs = video.currentTime * 1000;
  let updatedAt = 0;
  const nativeDuration = video.duration * 1000;
  const playableLimit = () => {
    const missing = firstUnwatchedMs(getCoverage(), getDuration());
    if (missing === null) return nativeDuration;
    return missing < nativeDuration
      ? missing
      : (Math.ceil(nativeDuration / VIDEO_PROGRESS_CELL_MS) - 1) *
          VIDEO_PROGRESS_CELL_MS;
  };
  const capture = () => {
    if (!ready || closed || !isCurrent()) return;
    positionMs = Math.max(
      0,
      Math.min(nativeDuration, video.currentTime * 1000),
    );
    updatedAt = Date.now();
  };
  const cancelResume = () => {
    canResume = false;
  };
  const seek = () => {
    cancelResume();
    if (!ready || closed || !isCurrent()) return;
    const limit = playableLimit() / 1000;
    if (video.currentTime > limit) video.currentTime = limit;
    capture();
  };
  const load = readVideoPlayback(storageKey)
    .then((value) => {
      if (
        value &&
        Math.abs(value.durationMs - nativeDuration) <= 1000 &&
        Number.isFinite(value.positionMs) &&
        Number.isFinite(value.updatedAt)
      ) {
        // A snapshot saved before restoration has coverage, but no user position.
        // Keep a deliberate rewind to zero (timestamp > 0) distinct from that.
        if (value.updatedAt > 0) bookmark = value;
        onCached(new Uint8Array(value.coverage));
      }
    })
    .catch(() => {
      /* Storage is optional; server coverage remains authoritative. */
    });
  const start = async (fallback = false) => {
    if (!fallback) await load;
    if (ready || closed || !isCurrent()) return;
    const limit = playableLimit();
    if (
      canResume &&
      video.paused &&
      !video.seeking &&
      video.currentTime === 0
    ) {
      const saved = bookmark?.positionMs;
      const position =
        saved === undefined
          ? limit === nativeDuration
            ? 0
            : limit
          : Math.max(
              0,
              Math.min(
                saved >= nativeDuration && limit === nativeDuration ? 0 : saved,
                limit,
              ),
            );
      if (position > 0) video.currentTime = position / 1000;
    }
    canResume = false;
    ready = true;
    clearTimeout(timeout);
    // Opening alone must not replace a more recent bookmark in another tab.
    positionMs = video.currentTime * 1000;
    onReady();
  };
  for (const name of ["play", "playing"])
    video.addEventListener(name, cancelResume);
  video.addEventListener("seeking", seek);
  const events = ["timeupdate", "seeked", "pause", "ended"];
  for (const name of events) video.addEventListener(name, capture);
  window.addEventListener("pagehide", capture);
  document.addEventListener("visibilitychange", capture);
  // A stalled metadata request must not make the video inaccessible indefinitely.
  const timeout = setTimeout(() => {
    void start(true);
  }, 8000);
  return {
    start,
    snapshot(): VideoPlaybackSnapshot {
      return {
        coverage: getCoverage().buffer as ArrayBuffer,
        positionMs,
        updatedAt,
        durationMs: getDuration(),
      };
    },
    stop() {
      capture();
      closed = true;
      clearTimeout(timeout);
      for (const name of ["play", "playing"])
        video.removeEventListener(name, cancelResume);
      video.removeEventListener("seeking", seek);
      for (const name of events) video.removeEventListener(name, capture);
      window.removeEventListener("pagehide", capture);
      document.removeEventListener("visibilitychange", capture);
    },
  };
}
