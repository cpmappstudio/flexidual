import assert from "node:assert/strict";
import test from "node:test";
import { canStudentAccessLiveClass } from "../convex/model/liveAccess";

const schoolAccess = {
  mode: "school" as const,
  allowedGradeCodes: ["07", "09"],
};
const studentSchoolIds = new Set(["school-a"]);

test("enrolled students always retain access", () => {
  assert.equal(canStudentAccessLiveClass({ isEnrolled: true, studentSchoolIds }), true);
});

test("school access requires an allowed grade in the same school", () => {
  assert.equal(canStudentAccessLiveClass({ isEnrolled: false, liveAccess: schoolAccess, studentGrade: "07", classSchoolId: "school-a", studentSchoolIds }), true);
  assert.equal(canStudentAccessLiveClass({ isEnrolled: false, liveAccess: schoolAccess, studentGrade: "08", classSchoolId: "school-a", studentSchoolIds }), false);
  assert.equal(canStudentAccessLiveClass({ isEnrolled: false, liveAccess: schoolAccess, studentGrade: "07", classSchoolId: "school-b", studentSchoolIds }), false);
});

test("private and missing policies deny non-enrolled students", () => {
  assert.equal(canStudentAccessLiveClass({ isEnrolled: false, liveAccess: { mode: "private", allowedGradeCodes: [] }, studentGrade: "07", classSchoolId: "school-a", studentSchoolIds }), false);
  assert.equal(canStudentAccessLiveClass({ isEnrolled: false, studentGrade: "07", classSchoolId: "school-a", studentSchoolIds }), false);
});
