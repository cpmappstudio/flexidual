import assert from "node:assert/strict";
import test from "node:test";
import type { QueryCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import {
  canManageCampusPeople,
  canManageClasses,
  canViewCampusPeople,
} from "../convex/permissions";
import type { UserRole } from "../convex/model/roles";

type Assignment = {
  userId: Id<"users">;
  orgId?: string;
  orgType: "system" | "school" | "campus";
  role: UserRole;
};

function permissionContext(assignments: Assignment[]) {
  const db = {
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

test("campus people are editable only by administrators and visible to teaching staff", async () => {
  for (const role of ["superadmin", "admin"] as const) {
    const assignment: Assignment =
      role === "superadmin"
        ? { userId, orgType: "system", role }
        : { userId, orgId: schoolId, orgType: "school", role };
    const ctx = permissionContext([assignment]);

    assert.equal(await canManageCampusPeople(ctx, userId, schoolId), true);
    assert.equal(
      await canViewCampusPeople(ctx, userId, campusId, schoolId),
      true,
    );
  }

  for (const role of ["principal", "teacher", "tutor", "student"] as const) {
    const ctx = permissionContext([
      { userId, orgId: campusId, orgType: "campus", role },
    ]);

    assert.equal(await canManageCampusPeople(ctx, userId, schoolId), false);
    assert.equal(
      await canViewCampusPeople(ctx, userId, campusId, schoolId),
      role === "principal" || role === "teacher",
    );
  }
});
