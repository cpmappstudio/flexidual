import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

async function seedUser(
  ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0],
  clerkId: string,
  fullName: string,
  isActive = true,
) {
  const [firstName, ...lastNameParts] = fullName.split(" ");
  return await ctx.db.insert("users", {
    clerkId,
    email: `${clerkId}@example.com`,
    firstName,
    lastName: lastNameParts.join(" "),
    fullName,
    isActive,
    createdAt: Date.now(),
  });
}

async function assignRole(
  ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0],
  args: {
    userId: Id<"users">;
    schoolId: Id<"schools">;
    orgId: string;
    role: "admin" | "teacher" | "student";
    gradeCode?: string;
  },
) {
  await ctx.db.insert("roleAssignments", {
    userId: args.userId,
    orgId: args.orgId,
    orgType: args.role === "admin" ? "school" : "campus",
    role: args.role,
    schoolId: args.schoolId,
    gradeCode: args.gradeCode,
    assignedAt: Date.now(),
    assignedBy: args.userId,
  });
}

test("course creation reviews every grade student and enrolls the selected roster", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-27T12:00:00Z"));
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const adminId = await seedUser(ctx, "enrollment-admin", "Ada Admin");
    const teacherId = await seedUser(
      ctx,
      "enrollment-teacher",
      "Taylor Teacher",
    );
    const activeStudentId = await seedUser(
      ctx,
      "active-grade-student",
      "Alex Active",
    );
    const inactiveStudentId = await seedUser(
      ctx,
      "inactive-grade-student",
      "Ivy Inactive",
      false,
    );
    const otherGradeStudentId = await seedUser(
      ctx,
      "other-grade-student",
      "Olivia Other",
    );
    const outsideStudentId = await seedUser(
      ctx,
      "outside-student",
      "Oscar Outside",
    );
    const schoolId = await ctx.db.insert("schools", {
      name: "Enrollment School",
      slug: "enrollment-school",
      timeZone: "UTC",
      scheduleStartMinutes: 8 * 60,
      scheduleEndMinutes: 17 * 60,
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Main Campus",
      slug: "enrollment-campus",
      timeZone: "UTC",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const outsideSchoolId = await ctx.db.insert("schools", {
      name: "Outside School",
      slug: "outside-school",
      timeZone: "UTC",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const outsideCampusId = await ctx.db.insert("campuses", {
      schoolId: outsideSchoolId,
      name: "Outside Campus",
      slug: "outside-campus",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    await Promise.all([
      assignRole(ctx, {
        userId: adminId,
        schoolId,
        orgId: schoolId,
        role: "admin",
      }),
      assignRole(ctx, {
        userId: teacherId,
        schoolId,
        orgId: campusId,
        role: "teacher",
      }),
      assignRole(ctx, {
        userId: activeStudentId,
        schoolId,
        orgId: campusId,
        role: "student",
        gradeCode: "05",
      }),
      assignRole(ctx, {
        userId: inactiveStudentId,
        schoolId,
        orgId: campusId,
        role: "student",
        gradeCode: "05",
      }),
      assignRole(ctx, {
        userId: otherGradeStudentId,
        schoolId,
        orgId: campusId,
        role: "student",
        gradeCode: "06",
      }),
      assignRole(ctx, {
        userId: outsideStudentId,
        schoolId: outsideSchoolId,
        orgId: outsideCampusId,
        role: "student",
        gradeCode: "05",
      }),
    ]);
    for (const [code, name, order] of [
      ["05", "5th Grade", 5],
      ["06", "6th Grade", 6],
    ] as const) {
      await ctx.db.insert("institutionGrades", {
        schoolId,
        code,
        name,
        order,
        createdAt: Date.now(),
        createdBy: adminId,
      });
    }
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Science 5",
      isActive: true,
      gradeCodes: ["05"],
      schoolId,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const academicPeriodId = await ctx.db.insert("academicPeriods", {
      schoolId,
      name: "2026-II",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      createdAt: Date.now(),
      createdBy: adminId,
    });
    return {
      campusId,
      curriculumId,
      academicPeriodId,
      teacherId,
      activeStudentId,
      inactiveStudentId,
      otherGradeStudentId,
      outsideStudentId,
    };
  });

  const asAdmin = t.withIdentity({ subject: "enrollment-admin" });
  const gradeStudents = await asAdmin.query(
    api.classes.listCourseCreationGradeStudents,
    {
      curriculumId: data.curriculumId,
      campusId: data.campusId,
      gradeCode: "05",
    },
  );
  expect(gradeStudents.map((student) => student._id)).toEqual([
    data.activeStudentId,
    data.inactiveStudentId,
  ]);
  expect(gradeStudents.map((student) => student.isActive)).toEqual([
    true,
    false,
  ]);

  const searchResults = await asAdmin.query(
    api.classes.searchCourseCreationStudents,
    {
      curriculumId: data.curriculumId,
      campusId: data.campusId,
      searchQuery: "Olivia",
    },
  );
  expect(searchResults).toMatchObject([
    { _id: data.otherGradeStudentId, gradeCode: "06", isActive: true },
  ]);

  const courseArgs = {
    name: "Science 5 · Taylor Teacher · 2026-II",
    curriculumId: data.curriculumId,
    campusId: data.campusId,
    teacherId: data.teacherId,
    academicPeriodId: data.academicPeriodId,
    gradeCode: "05",
    liveAccess: { mode: "private" as const, allowedGradeCodes: [] },
    weeklySlots: [
      {
        dayOfWeek: 2,
        startMinutes: 9 * 60,
        durationMinutes: 60,
        sessionType: "live" as const,
      },
    ],
  };
  await expect(
    asAdmin.mutation(api.classes.createWithSchedule, {
      ...courseArgs,
      studentIds: [data.activeStudentId, data.outsideStudentId],
    }),
  ).rejects.toThrow();

  const result = await asAdmin.mutation(api.classes.createWithSchedule, {
    ...courseArgs,
    studentIds: [
      data.activeStudentId,
      data.inactiveStudentId,
      data.otherGradeStudentId,
    ],
  });
  const persisted = await t.run(async (ctx) => {
    const [classes, enrollments] = await Promise.all([
      ctx.db
        .query("classes")
        .withIndex("by_curriculum", (q) =>
          q.eq("curriculumId", data.curriculumId),
        )
        .collect(),
      ctx.db
        .query("classEnrollments")
        .withIndex("by_class", (q) => q.eq("classId", result.classId))
        .collect(),
    ]);
    return { classes, enrollments };
  });
  expect(persisted.classes).toHaveLength(1);
  expect(
    persisted.enrollments.map((enrollment) => enrollment.studentId),
  ).toEqual([
    data.activeStudentId,
    data.inactiveStudentId,
    data.otherGradeStudentId,
  ]);
});
