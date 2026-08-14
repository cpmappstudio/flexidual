import assert from "node:assert/strict";
import test from "node:test";
import type { QueryCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import {
  canManageCampusPeople,
  canManageClasses,
  canManageInstitution,
  canViewCampusPeople,
  canViewInstitutionSettings,
  canViewStudentProfile,
} from "../convex/permissions";
import type { UserRole } from "../convex/model/roles";

type Assignment = {
  userId: Id<"users">;
  orgId?: string;
  orgType: "system" | "school" | "campus";
  role: UserRole;
  schoolId?: Id<"schools">;
};

function permissionContext(
  assignments: Assignment[],
  campuses: Array<{ _id: Id<"campuses">; schoolId: Id<"schools"> }> = [],
) {
  const db = {
    async get(id: Id<"campuses">) {
      return campuses.find((campus) => campus._id === id) ?? null;
    },
    query(table: string) {
      assert.equal(table, "roleAssignments");
      return {
        withIndex(
          _index: string,
          build: (query: {
            eq: (field: keyof Assignment, value: unknown) => unknown;
          }) => unknown,
        ) {
          const conditions: Array<[keyof Assignment, unknown]> = [];
          const query = {
            eq(field: keyof Assignment, value: unknown) {
              conditions.push([field, value]);
              return query;
            },
          };
          build(query);
          return {
            async collect() {
              return assignments.filter((assignment) =>
                conditions.every(
                  ([field, value]) => assignment[field] === value,
                ),
              );
            },
          };
        },
      };
    },
  };

  return { db } as unknown as QueryCtx;
}

const userId = "user" as Id<"users">;
const schoolId = "school" as Id<"schools">;
const campusId = "campus" as Id<"campuses">;
const otherCampusId = "other-campus" as Id<"campuses">;

test("course management is granted only at administrative scopes", async () => {
  assert.equal(
    await canManageClasses(
      permissionContext([{ userId, orgType: "system", role: "superadmin" }]),
      userId,
      campusId,
      schoolId,
    ),
    true,
  );
  assert.equal(
    await canManageClasses(
      permissionContext([
        { userId, orgId: schoolId, orgType: "school", role: "admin" },
      ]),
      userId,
      campusId,
      schoolId,
    ),
    true,
  );
  assert.equal(
    await canManageClasses(
      permissionContext([
        { userId, orgId: campusId, orgType: "campus", role: "principal" },
      ]),
      userId,
      campusId,
      schoolId,
    ),
    true,
  );
});

test("teachers and tutors cannot mutate course definitions", async () => {
  for (const role of ["teacher", "tutor"] as const) {
    assert.equal(
      await canManageClasses(
        permissionContext([
          { userId, orgId: campusId, orgType: "campus", role },
        ]),
        userId,
        campusId,
        schoolId,
      ),
      false,
    );
  }
});

test("campus people are managed by administrators and assigned principals", async () => {
  for (const role of ["superadmin", "admin"] as const) {
    const assignment: Assignment =
      role === "superadmin"
        ? { userId, orgType: "system", role }
        : { userId, orgId: schoolId, orgType: "school", role };
    const ctx = permissionContext([assignment]);

    assert.equal(
      await canManageCampusPeople(ctx, userId, campusId, schoolId),
      true,
    );
    assert.equal(
      await canViewCampusPeople(ctx, userId, campusId, schoolId),
      true,
    );
  }

  for (const role of ["principal", "teacher", "tutor", "student"] as const) {
    const ctx = permissionContext([
      { userId, orgId: campusId, orgType: "campus", role },
    ]);

    assert.equal(
      await canManageCampusPeople(ctx, userId, campusId, schoolId),
      role === "principal",
    );
    assert.equal(
      await canViewCampusPeople(ctx, userId, campusId, schoolId),
      role === "principal",
    );
  }

  const principalAtAnotherCampus = permissionContext([
    {
      userId,
      orgId: otherCampusId,
      orgType: "campus",
      role: "principal",
    },
  ]);
  assert.equal(
    await canManageCampusPeople(
      principalAtAnotherCampus,
      userId,
      campusId,
      schoolId,
    ),
    false,
  );
});

test("student profiles are visible only to administrators, principals, and campus teachers", async () => {
  for (const role of ["superadmin", "admin"] as const) {
    const assignment: Assignment =
      role === "superadmin"
        ? { userId, orgType: "system", role }
        : { userId, orgId: schoolId, orgType: "school", role };
    assert.equal(
      await canViewStudentProfile(
        permissionContext([assignment]),
        userId,
        campusId,
        schoolId,
      ),
      true,
    );
  }

  for (const role of ["principal", "teacher"] as const) {
    const ctx = permissionContext([
      { userId, orgId: campusId, orgType: "campus", role },
    ]);
    assert.equal(
      await canViewStudentProfile(ctx, userId, campusId, schoolId),
      true,
    );
  }

  for (const role of ["tutor", "student"] as const) {
    const ctx = permissionContext([
      { userId, orgId: campusId, orgType: "campus", role },
    ]);
    assert.equal(
      await canViewStudentProfile(ctx, userId, campusId, schoolId),
      false,
    );
  }

  const teacherAtAnotherCampus = permissionContext([
    {
      userId,
      orgId: otherCampusId,
      orgType: "campus",
      role: "teacher",
    },
  ]);
  assert.equal(
    await canViewStudentProfile(
      teacherAtAnotherCampus,
      userId,
      campusId,
      schoolId,
    ),
    false,
  );
});

test("institution settings are editable only by admins and visible to principals", async () => {
  const campus = { _id: campusId, schoolId };
  for (const assignment of [
    { userId, orgType: "system", role: "superadmin" as const },
    {
      userId,
      orgId: schoolId,
      orgType: "school",
      role: "admin" as const,
    },
  ] satisfies Assignment[]) {
    const ctx = permissionContext([assignment]);
    assert.equal(await canManageInstitution(ctx, userId, schoolId), true);
    assert.equal(await canViewInstitutionSettings(ctx, userId, schoolId), true);
  }

  const principalContext = permissionContext([
    {
      userId,
      orgId: campusId,
      orgType: "campus",
      role: "principal",
      schoolId,
    },
  ]);
  assert.equal(
    await canManageInstitution(principalContext, userId, schoolId),
    false,
  );
  assert.equal(
    await canViewInstitutionSettings(principalContext, userId, schoolId),
    true,
  );

  const legacyPrincipalContext = permissionContext(
    [{ userId, orgId: campusId, orgType: "campus", role: "principal" }],
    [campus],
  );
  assert.equal(
    await canViewInstitutionSettings(legacyPrincipalContext, userId, schoolId),
    true,
  );

  for (const role of ["teacher", "tutor", "student"] as const) {
    const ctx = permissionContext(
      [{ userId, orgId: campusId, orgType: "campus", role }],
      [campus],
    );
    assert.equal(await canManageInstitution(ctx, userId, schoolId), false);
    assert.equal(
      await canViewInstitutionSettings(ctx, userId, schoolId),
      false,
    );
  }
});
