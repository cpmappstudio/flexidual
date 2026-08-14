import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import {
  isCurriculumAvailableForGrade,
  retainOfferedGradeCodes,
} from "../lib/curriculum";
import {
  CURRICULUM_ICON_KEYS,
  DEFAULT_CURRICULUM_ICON,
  getCurriculumIconKey,
  getCurriculumIconSrc,
  isCurriculumIconKey,
} from "../lib/curriculum-icons";

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

test("curriculum icons resolve only from the approved catalog", () => {
  assert.equal(isCurriculumIconKey("math"), true);
  assert.equal(isCurriculumIconKey("../settings-icon"), false);
  assert.equal(getCurriculumIconKey(undefined), DEFAULT_CURRICULUM_ICON);
  assert.equal(getCurriculumIconKey("unknown"), DEFAULT_CURRICULUM_ICON);
  assert.equal(getCurriculumIconSrc("math"), "/curriculum-icons/math.png");
});

test("the curriculum icon catalog includes every public icon", () => {
  const publicIconKeys = readdirSync(
    new URL("../public/curriculum-icons/", import.meta.url),
  )
    .filter((fileName) => fileName.endsWith(".png"))
    .map((fileName) => fileName.slice(0, -4))
    .sort();

  assert.deepEqual([...CURRICULUM_ICON_KEYS].sort(), publicIconKeys);
});
