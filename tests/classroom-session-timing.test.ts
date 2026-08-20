import assert from "node:assert/strict";
import test from "node:test";

import { getClassroomEndingSoonState } from "../components/classroom/classroom-session-timing";
import { getClassroomQueryNow } from "../components/classroom/use-classroom-clock";

test("uses one stable query bucket for the classroom clock", () => {
  assert.equal(getClassroomQueryNow(31_234), 30_000);
});

test("shows the ending notice only inside the warning window", () => {
  const timing = {
    effectiveEnd: 120_000,
    warningStartsAt: 60_000,
    hardEndsAt: 180_000,
  };

  assert.deepEqual(
    getClassroomEndingSoonState({
      roomName: "room-1",
      now: 90_000,
      timing,
    }),
    { isEndingSoon: true, noticeKey: "room-1:120000" },
  );
  assert.equal(
    getClassroomEndingSoonState({
      roomName: "room-1",
      now: 120_000,
      timing,
    }).isEndingSoon,
    false,
  );
});

test("does not warn staff when the session reached its hard ending", () => {
  assert.equal(
    getClassroomEndingSoonState({
      roomName: "room-1",
      now: 90_000,
      timing: {
        effectiveEnd: 120_000,
        warningStartsAt: 60_000,
        hardEndsAt: 120_000,
      },
    }).isEndingSoon,
    false,
  );
});

test("keeps preview timing independent from live timing", () => {
  assert.deepEqual(
    getClassroomEndingSoonState({
      roomName: "room-1",
      now: 0,
      timing: null,
      isPreview: true,
    }),
    { isEndingSoon: true, noticeKey: "room-1:preview" },
  );
});
