import assert from "node:assert/strict";
import test from "node:test";
import { getProfileSettingsAccess } from "../lib/profile-settings-access";

test("resolves profile settings access by role", () => {
  assert.equal(getProfileSettingsAccess("admin", false), "full");
  assert.equal(getProfileSettingsAccess("superadmin", false), "full");
  assert.equal(
    getProfileSettingsAccess("teacher", false),
    "profile-without-email",
  );
  assert.equal(
    getProfileSettingsAccess("tutor", false),
    "profile-without-email",
  );
  assert.equal(getProfileSettingsAccess("principal", false), "security-only");
  assert.equal(getProfileSettingsAccess("student", false), "password-only");
  assert.equal(getProfileSettingsAccess(null, false), "password-only");
  assert.equal(getProfileSettingsAccess("student", true), "full");
});
