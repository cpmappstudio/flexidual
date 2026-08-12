import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

test("students can enter through their assigned campus", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  await t.run(async (ctx) => {
    const studentId = await ctx.db.insert("users", {
      clerkId: "student-clerk-id",
      firstName: "Sam",
      lastName: "Student",
      fullName: "Sam Student",
      isActive: true,
      createdAt: now,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "Central School",
      slug: "central-school",
      isActive: true,
      createdAt: now,
      createdBy: studentId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Main Campus",
      slug: "main-campus",
      isActive: true,
      createdAt: now,
      createdBy: studentId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: studentId,
      orgId: campusId,
      orgType: "campus",
      role: "student",
      schoolId,
      assignedAt: now,
      assignedBy: studentId,
    });
  });

  const options = await t
    .withIdentity({ subject: "student-clerk-id" })
    .query(api.organizations.getSwitcherOptions, {});

  expect(options.schools).toMatchObject([{ slug: "central-school" }]);
  expect(options.campuses).toMatchObject([{ slug: "main-campus" }]);
  expect(options.canCreateInstitutions).toBe(false);
  expect(options.manageableSchoolIds).toEqual([]);
});
