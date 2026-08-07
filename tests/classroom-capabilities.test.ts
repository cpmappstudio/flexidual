import assert from "node:assert/strict";
import test from "node:test";
import {
  canRoleSendStudentScreenShareDecision,
  getClassroomCapabilities,
  isClassroomSessionAuthority,
} from "../components/classroom/classroom-capabilities";

test("preserves staff classroom authority roles", () => {
  for (const role of ["teacher", "admin", "superadmin", "tutor", "principal"]) {
    assert.equal(isClassroomSessionAuthority(role), true);
    assert.equal(
      getClassroomCapabilities("staff", role).canManageSession,
      true,
    );
  }

  assert.equal(isClassroomSessionAuthority("student"), false);
});

test("preserves student classroom capabilities", () => {
  const capabilities = getClassroomCapabilities("student", "student");

  assert.equal(capabilities.canRaiseOwnHand, true);
  assert.equal(capabilities.canRequestScreenShare, true);
  assert.equal(capabilities.canSwitchToNextClass, true);
  assert.equal(capabilities.canManageSession, false);
  assert.equal(capabilities.canManageRecording, false);
});

test("preserves the current trusted screen share decision roles", () => {
  assert.equal(canRoleSendStudentScreenShareDecision("teacher"), true);
  assert.equal(canRoleSendStudentScreenShareDecision("admin"), true);
  assert.equal(canRoleSendStudentScreenShareDecision("principal"), false);
  assert.equal(canRoleSendStudentScreenShareDecision("tutor"), false);
  assert.equal(canRoleSendStudentScreenShareDecision("superadmin"), false);
});
