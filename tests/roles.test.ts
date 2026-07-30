import assert from "node:assert/strict";
import test from "node:test";
import {
  canRoleManageCourses,
  hasOnlyInstructorStaffRoles,
  isRoleValidForOrganization,
} from "../convex/model/roles";
import {
  getRouteRole,
  getHighestStaffRole,
  hasStaffAccess,
  isStaffRole,
} from "../lib/rbac";

test("roles are assigned only at their supported organization level", () => {
  assert.equal(isRoleValidForOrganization("superadmin", "system"), true);
  assert.equal(isRoleValidForOrganization("admin", "school"), true);
  assert.equal(isRoleValidForOrganization("principal", "campus"), true);
  assert.equal(isRoleValidForOrganization("teacher", "campus"), true);
  assert.equal(isRoleValidForOrganization("tutor", "campus"), true);
  assert.equal(isRoleValidForOrganization("student", "campus"), true);

  assert.equal(isRoleValidForOrganization("admin", "campus"), false);
  assert.equal(isRoleValidForOrganization("principal", "school"), false);
  assert.equal(isRoleValidForOrganization("student", "school"), false);
});

test("staff access ignores student-only sessions and uses the highest staff role", () => {
  const studentClaims = { metadata: { roles: { campus: "student" } } };
  const mixedClaims = {
    metadata: {
      roles: {
        "campus-a": "teacher",
        "campus-b": "principal",
      },
    },
  };

  assert.equal(hasStaffAccess(studentClaims), false);
  assert.equal(getHighestStaffRole(studentClaims), null);
  assert.equal(hasStaffAccess(mixedClaims), true);
  assert.equal(getHighestStaffRole(mixedClaims), "principal");
});

test("staff role checks fail closed for students and unresolved roles", () => {
  for (const role of ["superadmin", "admin", "principal", "teacher", "tutor"]) {
    assert.equal(isStaffRole(role), true);
  }

  assert.equal(isStaffRole("student"), false);
  assert.equal(isStaffRole("unexpected"), false);
  assert.equal(isStaffRole(null), false);
});

test("organization routes resolve exact roles without a shared admin slug", () => {
  const claims = {
    metadata: {
      roles: {
        "main-campus": "teacher",
      },
    },
  };

  assert.equal(getRouteRole(claims, "main-campus"), "teacher");
  assert.equal(getRouteRole(claims, "other-campus"), null);
});

test("institution admins may resolve child campus routes before Convex validation", () => {
  const claims = { metadata: { roles: { institution: "admin" } } };
  assert.equal(getRouteRole(claims, "campus"), "admin");
});

test("only administrators and principals manage course definitions", () => {
  assert.equal(canRoleManageCourses("superadmin"), true);
  assert.equal(canRoleManageCourses("admin"), true);
  assert.equal(canRoleManageCourses("principal"), true);
  assert.equal(canRoleManageCourses("teacher"), false);
  assert.equal(canRoleManageCourses("tutor"), false);
  assert.equal(canRoleManageCourses("student"), false);

  assert.equal(hasOnlyInstructorStaffRoles(["teacher"]), true);
  assert.equal(hasOnlyInstructorStaffRoles(["tutor"]), true);
  assert.equal(hasOnlyInstructorStaffRoles(["teacher", "tutor"]), true);
  assert.equal(hasOnlyInstructorStaffRoles(["teacher", "principal"]), false);
});
