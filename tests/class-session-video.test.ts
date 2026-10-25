import assert from "node:assert/strict";
import { test } from "node:test";
import { ConvexError } from "convex/values";
import { getErrorMessage, parseConvexError } from "../lib/error-utils";
import {
  MAX_SESSION_VIDEO_BYTES,
  SESSION_VIDEO_PART_BYTES,
  sessionVideoPartSize,
  validSessionVideo,
} from "../lib/class-session-video";

test("session video metadata rejects unsafe names, sizes, types and durations", () => {
  const video = {
    name: "lesson.MP4",
    contentType: "video/mp4",
    size: 100,
    durationMs: 60_000,
  };
  assert.equal(validSessionVideo(video), true);
  for (const overrides of [
    { name: "" },
    { name: "../lesson.mp4" },
    { name: "bad\n.mp4" },
    { name: "lesson.mov" },
    { contentType: "text/html" },
    { size: 0 },
    { size: MAX_SESSION_VIDEO_BYTES + 1 },
    { size: 1.5 },
    { size: NaN },
    { durationMs: 0 },
    { durationMs: Infinity },
    { durationMs: 12 * 3_600_000 + 1 },
  ])
    assert.equal(validSessionVideo({ ...video, ...overrides }), false);
});

test("multipart boundaries retain the exact last fragment and reject invalid part indices", () => {
  const size = 2 * SESSION_VIDEO_PART_BYTES + 1;
  assert.equal(sessionVideoPartSize(size, 1), SESSION_VIDEO_PART_BYTES);
  assert.equal(sessionVideoPartSize(size, 2), SESSION_VIDEO_PART_BYTES);
  assert.equal(sessionVideoPartSize(size, 3), 1);
  assert.equal(
    sessionVideoPartSize(SESSION_VIDEO_PART_BYTES, 1),
    SESSION_VIDEO_PART_BYTES,
  );
  for (const number of [0, -1, 1.5, 4, NaN, Infinity])
    assert.equal(sessionVideoPartSize(size, number), null);
});

test("course schedule conflicts explain how to preserve an attached prerecorded video", () => {
  const error = parseConvexError(
    new ConvexError("PRERECORDED_VIDEO_SCHEDULE_CONFLICT"),
  );
  assert.ok(error);
  assert.equal(
    getErrorMessage(error, (key) => key),
    "class.prerecordedVideoScheduleConflict",
  );
});
