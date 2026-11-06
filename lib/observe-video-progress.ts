import {
  addPlayedRange,
  coverageSize,
  validVideoDuration,
  VIDEO_PROGRESS_CELL_MS,
} from "./video-progress";

/** Native playback ranges clipped to uninterrupted visible/PiP playback, never buffered ranges. */
export function observeVideoProgress(
  video: HTMLVideoElement,
  onChange: (coverage: Uint8Array, playedToEnd: boolean) => void,
  onBoundary: () => void,
) {
  const durationMs = video.duration * 1000;
  if (!validVideoDuration(durationMs)) return () => {};
  const coverage = new Uint8Array(coverageSize(durationMs));
  let allowed = visible();
  let playing = !video.paused && !video.ended;
  let anchor = video.currentTime * 1000;
  // Retain only the current unfinished edge, not an ever-growing playback history.
  // Adjacent eligible ranges across pause/waiting can complete the same second.
  let edgeStart = anchor;
  let edgeEnd = anchor;
  function visible() {
    return (
      document.visibilityState === "visible" ||
      document.pictureInPictureElement === video ||
      (video as HTMLVideoElement & { webkitPresentationMode?: string })
        .webkitPresentationMode === "picture-in-picture"
    );
  }
  const reset = () => {
    anchor = video.currentTime * 1000;
  };
  const sample = (finishing = false) => {
    if (!allowed || video.seeking) return;
    if (!playing && !(finishing && video.ended)) {
      // Ignore clock movement reported while paused/stalled. Preserve the final
      // edge when pause precedes ended, so the native ending can finish it.
      if (!video.ended) reset();
      return;
    }
    const end = Math.min(durationMs, video.currentTime * 1000);
    let changed = false;
    for (let i = 0; i < video.played.length; i++) {
      let start = Math.max(anchor, video.played.start(i) * 1000);
      const stop = Math.min(end, video.played.end(i) * 1000);
      if (stop > start) {
        if (start <= edgeEnd && stop >= edgeStart)
          start = Math.min(start, edgeStart);
        changed = addPlayedRange(coverage, start, stop, durationMs) || changed;
        edgeStart = Math.max(
          start,
          Math.floor(stop / VIDEO_PROGRESS_CELL_MS) * VIDEO_PROGRESS_CELL_MS,
        );
        edgeEnd = stop;
      }
    }
    anchor = Math.max(
      anchor,
      Math.floor(end / VIDEO_PROGRESS_CELL_MS) * VIDEO_PROGRESS_CELL_MS,
    );
    // ended alone is not evidence: the final native range must have reached the
    // end while eligible. A seek/hidden ending cannot complete a missing tail.
    const playedToEnd =
      finishing && video.ended && end === durationMs && edgeEnd === durationMs;
    if (changed || playedToEnd) onChange(coverage.slice(), playedToEnd);
  };
  const start = () => {
    // `playing` can fire after the media clock has already advanced. Only seeks
    // and visibility changes reset the eligible anchor; pauses/buffering do not.
    playing = true;
  };
  const stop = () => {
    sample();
    playing = false;
    onBoundary();
  };
  const finish = () => {
    // Some browsers fire pause before ended. Sample the native final range once more.
    sample(true);
    playing = false;
    onBoundary();
  };
  const waiting = () => {
    sample();
    playing = false;
  };
  const seek = () => {
    reset();
  };
  const visibility = () => {
    sample();
    allowed = visible();
    reset();
    if (!allowed) onBoundary();
  };
  const events: [EventTarget, string, EventListener][] = [
    [video, "timeupdate", () => sample()],
    [video, "playing", start],
    [video, "pause", stop],
    [video, "ended", finish],
    [video, "waiting", waiting],
    [video, "seeking", seek],
    [video, "seeked", seek],
    [document, "visibilitychange", visibility],
    [video, "enterpictureinpicture", visibility],
    [video, "leavepictureinpicture", visibility],
    [video, "webkitpresentationmodechanged", visibility],
    [
      window,
      "pagehide",
      () => {
        sample();
        onBoundary();
      },
    ],
  ];
  for (const [target, name, listener] of events)
    target.addEventListener(name, listener);
  return () => {
    sample();
    for (const [target, name, listener] of events)
      target.removeEventListener(name, listener);
    onBoundary();
  };
}
