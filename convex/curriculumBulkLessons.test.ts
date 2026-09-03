import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

test("creates a curriculum and its pasted lessons in one transaction", async () => {
  const t = convexTest(schema, modules);
  const schoolId = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      clerkId: "bulk-curriculum-admin",
      email: "bulk@example.com",
      firstName: "Bulk",
      lastName: "Admin",
      fullName: "Bulk Admin",
      isActive: true,
      createdAt: Date.now(),
    });
    const id = await ctx.db.insert("schools", {
      name: "Bulk School",
      slug: "bulk-school",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgId: id,
      orgType: "school",
      role: "admin",
      schoolId: id,
      assignedAt: Date.now(),
      assignedBy: adminId,
    });
    return id;
  });

  const admin = t.withIdentity({ subject: "bulk-curriculum-admin" });
  const result = await admin.mutation(api.curriculums.createBatch, {
    orgType: "school",
    orgId: schoolId,
    curriculums: [
      {
        title: "Reading 1",
        lessons: [
          { title: " Lesson 1 ", description: " Introduction " },
          { title: "Lesson 2" },
        ],
      },
    ],
  });

  const lessons = await t.run((ctx) =>
    ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", result.ids[0]))
      .collect(),
  );
  expect(lessons).toMatchObject([
    { title: "Lesson 1", description: "Introduction", order: 1 },
    { title: "Lesson 2", order: 2 },
  ]);

  await admin.mutation(api.lessons.createBatch, {
    curriculumId: result.ids[0],
    lessons: [{ title: "Lesson 3" }, { title: "Lesson 4" }],
  });
  const appendedLessons = await t.run((ctx) =>
    ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", result.ids[0]))
      .collect(),
  );
  expect(appendedLessons.map(({ title, order }) => ({ title, order }))).toEqual(
    [
      { title: "Lesson 1", order: 1 },
      { title: "Lesson 2", order: 2 },
      { title: "Lesson 3", order: 3 },
      { title: "Lesson 4", order: 4 },
    ],
  );
});
