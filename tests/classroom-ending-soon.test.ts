import assert from "node:assert/strict";
import test from "node:test";

import {
  getClassroomEndingSoonNoticeKey,
  getClassroomEndingSoonStorageKey,
  shouldShowClassroomEndingSoonNotice,
} from "../components/classroom/classroom-ending-soon";

test("builds a stable notice key for the room and effective ending", () => {
  assert.equal(
    getClassroomEndingSoonNoticeKey({
      roomName: "room-1",
      effectiveEnd: 100,
    }),
    "room-1:100",
  );
  assert.equal(
    getClassroomEndingSoonNoticeKey({ roomName: "room-1", isPreview: true }),
    "room-1:preview",
  );
  assert.equal(
    getClassroomEndingSoonStorageKey("room-1:100"),
    "flexidual:classroom-ending-soon:room-1:100",
  );
});

test("hides the notice outside the ending-soon window", () => {
  assert.equal(
    shouldShowClassroomEndingSoonNotice({
      isEndingSoon: false,
      noticeKey: "room-1:100",
      dismissedNoticeKey: null,
    }),
    false,
  );
});

test("shows a new ending-soon notice", () => {
  assert.equal(
    shouldShowClassroomEndingSoonNotice({
      isEndingSoon: true,
      noticeKey: "room-1:100",
      dismissedNoticeKey: null,
    }),
    true,
  );
});

test("keeps the dismissed notice hidden for the same class ending", () => {
  assert.equal(
    shouldShowClassroomEndingSoonNotice({
      isEndingSoon: true,
      noticeKey: "room-1:100",
      dismissedNoticeKey: "room-1:100",
    }),
    false,
  );
});

test("shows the notice again when the effective ending changes", () => {
  assert.equal(
    shouldShowClassroomEndingSoonNotice({
      isEndingSoon: true,
      noticeKey: "room-1:200",
      dismissedNoticeKey: "room-1:100",
    }),
    true,
  );
});

test("does not show a notice without a stable key", () => {
  assert.equal(
    shouldShowClassroomEndingSoonNotice({
      isEndingSoon: true,
      noticeKey: null,
      dismissedNoticeKey: null,
    }),
    false,
  );
});
