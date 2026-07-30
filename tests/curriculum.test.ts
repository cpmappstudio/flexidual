import assert from "node:assert/strict";
import test from "node:test";
import {
  isCurriculumAvailableForGrade,
  retainOfferedGradeCodes,
} from "../lib/curriculum";

test("curriculums are available only for explicitly assigned grades", () => {
  assert.equal(isCurriculumAvailableForGrade(undefined, "05"), false);
  assert.equal(isCurriculumAvailableForGrade([], "05"), false);
  assert.equal(isCurriculumAvailableForGrade(["04"], "05"), false);
  assert.equal(isCurriculumAvailableForGrade(["04", "05"], "05"), true);
});

test("curriculum edits discard stale legacy grade codes", () => {
  assert.deepEqual(
    retainOfferedGradeCodes(["05", "1ST", "1ST"], ["1ST", "2ND"]),
    ["1ST"],
  );
});
