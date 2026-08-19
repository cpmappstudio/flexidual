import assert from "node:assert/strict";
import test from "node:test";

import {
  getClassroomParticipantCapacity,
  getClassroomParticipantLayout,
  getClassroomParticipantPage,
} from "../components/classroom/use-classroom-participant-pagination";

test("reserves the complete row structure for every participant page", () => {
  assert.deepEqual(
    getClassroomParticipantLayout({
      width: 256,
      height: 560,
      columnGap: 0,
      rowGap: 0,
      horizontalPadding: 0,
      verticalPadding: 0,
    }),
    { capacity: 8, columnCount: 2, rowCount: 4 },
  );
});

test("fits only complete participant tiles inside the sidebar viewport", () => {
  assert.equal(
    getClassroomParticipantCapacity({
      width: 256,
      height: 560,
      columnGap: 0,
      rowGap: 0,
      horizontalPadding: 0,
      verticalPadding: 0,
    }),
    8,
  );
});

test("adapts participant capacity to a shorter viewport", () => {
  assert.equal(
    getClassroomParticipantCapacity({
      width: 256,
      height: 310,
      columnGap: 0,
      rowGap: 0,
      horizontalPadding: 0,
      verticalPadding: 0,
    }),
    4,
  );
});

test("does not mount a partial row when no tile fits", () => {
  assert.equal(
    getClassroomParticipantCapacity({
      width: 256,
      height: 100,
      columnGap: 0,
      rowGap: 0,
      horizontalPadding: 0,
      verticalPadding: 0,
    }),
    0,
  );
});

test("resolves the page containing a selected participant", () => {
  assert.equal(getClassroomParticipantPage(0, 8), 0);
  assert.equal(getClassroomParticipantPage(7, 8), 0);
  assert.equal(getClassroomParticipantPage(8, 8), 1);
  assert.equal(getClassroomParticipantPage(20, 8), 2);
});

test("keeps selection on the first page before capacity is available", () => {
  assert.equal(getClassroomParticipantPage(8, 0), 0);
  assert.equal(getClassroomParticipantPage(-1, 8), 0);
});
