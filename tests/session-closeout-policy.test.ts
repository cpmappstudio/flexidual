import assert from "node:assert/strict";
import test from "node:test";

import { getSessionCloseoutSubmission } from "../lib/session-closeout-policy";

test("a pending closeout requires permission and complete attendance", () => {
  assert.deepEqual(
    getSessionCloseoutSubmission({
      closureStatus: "pending",
      canClose: true,
      isAttendanceComplete: true,
    }),
    { canSubmit: true, shouldSaveReport: true },
  );

  for (const invalidInput of [
    { canClose: false, isAttendanceComplete: true },
    { canClose: true, isAttendanceComplete: false },
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
      isAttendanceComplete: false,
    }),
    { canSubmit: true, shouldSaveReport: false },
  );
});
