import assert from "node:assert/strict";
import { test } from "node:test";
import type { APIRequestContext } from "@playwright/test";
import { AuthenticationRequired, parseProgress, parseSavedProgress, readProgress, summarize } from "../scripts/abeka/progress";

const lesson = {
  SessionName: "Test subject", LessonDisplayName: "Lesson 1", PercentDisplay: "95%",
  SegmentId: "1", SubscriptionItem: "2", SubscriptionNumber: "3",
  LessonLengthDisplay: "30 Mins 0 Secs", LessonProgressDisplay: "31 Mins 4 Secs",
  Completed: "No", LastViewed: "09/01/2026",
};
const payload = (...lessons: object[]) => ({ d: lessons.map((row) => JSON.stringify(row)) });

test("preserves explicit completion and watched time exceeding video length", () => {
  const [row] = parseProgress(payload(lesson));
  assert.equal(row.completed, false);
  assert.equal(row.watchedSeconds, 1864);
  assert.equal(row.lastViewed, "2026-09-01");
});

test("accepts unviewed lessons without external identifiers", () => {
  const rows = parseProgress(payload({ ...lesson, SegmentId: "", SubscriptionItem: "",
    SubscriptionNumber: "", LastViewed: "(not viewed)", PercentDisplay: "0%",
    LessonProgressDisplay: "0 Mins 0 Secs" }));
  assert.equal(rows[0].segmentId, null);
  assert.deepEqual(summarize(rows), { lessons: 1, completed: 0, partial: 0, unviewed: 1 });
});

test("handles the extra JSON quoting in copied samples", () => {
  assert.deepEqual(parseSavedProgress(JSON.stringify(JSON.stringify(payload(lesson)))), parseProgress(payload(lesson)));
});

test("rejects empty, malformed, duplicate and mixed-subject responses", () => {
  for (const invalid of [null, {}, { d: [] }, { d: ["broken"] }, { d: [lesson] },
    payload(lesson, lesson), payload(lesson, { ...lesson, LessonDisplayName: "Lesson 2", SessionName: "Other" }),
    payload({ ...lesson, PercentDisplay: "101%" }), payload({ ...lesson, LastViewed: "02/30/2026" }),
    payload({ ...lesson, Completed: "perhaps" }), payload({ ...lesson, LessonLengthDisplay: "unknown" })])
    assert.throws(() => parseProgress(invalid), /vacía o incompatible/);
});

function mockRequest(status: number, contentType = "application/json", body: unknown = payload(lesson)) {
  let disposed = false;
  const request = { post: async (_url: string, options: { maxRedirects: number }) => {
    assert.equal(options.maxRedirects, 0);
    return { status: () => status, headers: () => ({ "content-type": contentType }),
      json: async () => body, dispose: async () => { disposed = true; } };
  } } as unknown as APIRequestContext;
  return { request, disposed: () => disposed };
}

test("rejects missing authentication without treating it as empty progress", async () => {
  for (const status of [302, 401, 403]) {
    const mock = mockRequest(status);
    await assert.rejects(readProgress(mock.request, "123", "456"), AuthenticationRequired);
    assert.equal(mock.disposed(), true);
  }
});

test("rejects HTML login screens, server errors and empty results", async () => {
  for (const mock of [mockRequest(200, "text/html"), mockRequest(500), mockRequest(200, "application/json", { d: [] })]) {
    await assert.rejects(readProgress(mock.request, "123", "456"));
    assert.equal(mock.disposed(), true);
  }
});

test("reads a valid response and disposes it", async () => {
  const mock = mockRequest(200);
  assert.equal((await readProgress(mock.request, "123", "456")).length, 1);
  assert.equal(mock.disposed(), true);
  await assert.rejects(readProgress(mock.request, "../invalid", "456"));
});
