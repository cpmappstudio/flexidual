import assert from "node:assert/strict";
import test from "node:test";
import { isCurriculumAvailableForGrade } from "../lib/curriculum";

test("curriculums are available only for explicitly assigned grades", () => {
  assert.equal(isCurriculumAvailableForGrade(undefined, "05"), false);
  assert.equal(isCurriculumAvailableForGrade([], "05"), false);
  assert.equal(isCurriculumAvailableForGrade(["04"], "05"), false);
  assert.equal(isCurriculumAvailableForGrade(["04", "05"], "05"), true);
});
