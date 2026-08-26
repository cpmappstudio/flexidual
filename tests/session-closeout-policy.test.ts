import assert from "node:assert/strict";
import test from "node:test";

import { getSessionCloseoutSubmission } from "../lib/session-closeout-policy";

test("a pending closeout requires permission, lessons, and complete attendance", () => {
  assert.deepEqual(
    getSessionCloseoutSubmission({
      closureStatus: "pending",
      canClose: true,
      selectedLessonCount: 1,
      isAttendanceComplete: true,
    }),
    { canSubmit: true, shouldSaveReport: true },
  );

  for (const invalidInput of [
    { canClose: false, selectedLessonCount: 1, isAttendanceComplete: true },
    { canClose: true, selectedLessonCount: 0, isAttendanceComplete: true },
    { canClose: true, selectedLessonCount: 1, isAttendanceComplete: false },
  ]) {
    assert.deepEqual(
      getSessionCloseoutSubmission({
        closureStatus: "pending",
        ...invalidInput,
      }),
      { canSubmit: false, shouldSaveReport: true },
    );
  }
});

test("a saved report retries only the technical class finalization", () => {
  assert.deepEqual(
    getSessionCloseoutSubmission({
      closureStatus: "completed",
      canClose: false,
      selectedLessonCount: 0,
      isAttendanceComplete: false,
    }),
    { canSubmit: true, shouldSaveReport: false },
  );
});
