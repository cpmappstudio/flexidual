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
    role: "admin" | "principal" | "teacher" | "student";
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
    const principalId = await seedUser(
      ctx,
      "enrollment-principal",
      "Parker Principal",
    );
    const inactivePrincipalId = await seedUser(
      ctx,
      "inactive-enrollment-principal",
      "Ivy Principal",
      false,
    );
    const outsidePrincipalId = await seedUser(
      ctx,
      "outside-enrollment-principal",
      "Owen Principal",
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
        userId: principalId,
        schoolId,
        orgId: campusId,
        role: "principal",
      }),
      assignRole(ctx, {
        userId: inactivePrincipalId,
        schoolId,
        orgId: campusId,
        role: "principal",
      }),
      assignRole(ctx, {
        userId: outsidePrincipalId,
        schoolId: outsideSchoolId,
        orgId: outsideCampusId,
        role: "principal",
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
    const otherGradeCurriculumId = await ctx.db.insert("curriculums", {
      title: "History 6",
      isActive: true,
      gradeCodes: ["06"],
      schoolId,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const sameGradeCurriculumId = await ctx.db.insert("curriculums", {
      title: "Language 5",
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
      otherGradeCurriculumId,
      sameGradeCurriculumId,
      academicPeriodId,
      teacherId,
      principalId,
      inactivePrincipalId,
      outsidePrincipalId,
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

  for (const teacherId of [data.inactivePrincipalId, data.outsidePrincipalId]) {
    await expect(
      asAdmin.mutation(api.classes.createWithSchedule, {
        ...courseArgs,
        teacherId,
        studentIds: [],
      }),
    ).rejects.toThrow("INVALID_TEACHER");
  }

  const principalCourse = await asAdmin.mutation(
    api.classes.createWithSchedule,
    {
      ...courseArgs,
      name: "Science 5 · Parker Principal · 2026-II",
      teacherId: data.principalId,
      studentIds: [],
      weeklySlots: [
        {
          dayOfWeek: 4,
          startMinutes: 13 * 60,
          durationMinutes: 60,
          sessionType: "live",
        },
      ],
    },
  );
  expect(
    await t.run((ctx) => ctx.db.get("classes", principalCourse.classId)),
  ).toMatchObject({ teacherId: data.principalId });

  const courseToReassign = await asAdmin.mutation(
    api.classes.createWithSchedule,
    {
      ...courseArgs,
      name: "Science 5 · Reassignment · 2026-II",
      studentIds: [],
      weeklySlots: [
        {
          dayOfWeek: 3,
          startMinutes: 15 * 60,
          durationMinutes: 60,
          sessionType: "live",
        },
      ],
    },
  );
  await asAdmin.mutation(api.classes.update, {
    classId: courseToReassign.classId,
    teacherId: data.principalId,
  });
  expect(
    await t.run((ctx) => ctx.db.get("classes", courseToReassign.classId)),
  ).toMatchObject({ teacherId: data.principalId });

  const principalNotifications = await t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_recipient_and_created_at", (q) =>
        q.eq("recipientId", data.principalId),
      )
      .collect(),
  );
  expect(principalNotifications).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "course_assignment",
        action: "added",
      }),
    ]),
  );

  let shareableConflict: unknown;
  try {
    await asAdmin.mutation(api.classes.createWithSchedule, {
      ...courseArgs,
      name: "History 6 · Taylor Teacher · 2026-II",
      curriculumId: data.otherGradeCurriculumId,
      gradeCode: "06",
      studentIds: [],
    });
  } catch (error) {
    shareableConflict = error;
  }
  expect(shareableConflict).toMatchObject({
    data: {
      code: "TEACHER_SCHEDULE_CONFLICT",
      canShare: true,
      conflicts: [{ classId: result.classId, gradeCode: "05" }],
    },
  });

  await expect(
    asAdmin.mutation(api.classes.createWithSchedule, {
      ...courseArgs,
      name: "History 6 · Taylor Teacher · 2026-II",
      curriculumId: data.otherGradeCurriculumId,
      gradeCode: "06",
      studentIds: [data.otherGradeStudentId],
      approvedScheduleShareIds: [result.classId],
    }),
  ).rejects.toMatchObject({
    data: {
      code: "TEACHER_SCHEDULE_CONFLICT",
      canShare: false,
    },
  });

  const sharedCourse = await asAdmin.mutation(api.classes.createWithSchedule, {
    ...courseArgs,
    name: "History 6 · Taylor Teacher · 2026-II",
    curriculumId: data.otherGradeCurriculumId,
    gradeCode: "06",
    studentIds: [],
    approvedScheduleShareIds: [result.classId],
  });
  const shares = await t.run((ctx) =>
    ctx.db.query("courseScheduleShares").collect(),
  );
  expect(shares).toHaveLength(1);
  expect(new Set([shares[0].classId, shares[0].sharedClassId])).toEqual(
    new Set([result.classId, sharedCourse.classId]),
  );
  expect(shares[0]).toMatchObject({
    campusId: data.campusId,
    academicPeriodId: data.academicPeriodId,
    teacherId: data.teacherId,
  });
  const sameGradeOtherTeacherCourseId = await t.run(async (ctx) => {
    const otherTeacherId = await seedUser(
      ctx,
      "other-schedule-guide-teacher",
      "Morgan Teacher",
    );
    const classId = await ctx.db.insert("classes", {
      name: "Math 5 · Morgan Teacher · 2026-II",
      curriculumId: data.curriculumId,
      teacherId: otherTeacherId,
      classType: "standard",
      academicPeriodId: data.academicPeriodId,
      gradeCode: "05",
      timeZone: "UTC",
      isActive: true,
      createdAt: Date.now(),
      createdBy: otherTeacherId,
      campusId: data.campusId,
    });
    await ctx.db.insert("classSchedule", {
      classId,
      sessionType: "live",
      scheduledStart: Date.UTC(2026, 8, 3, 12),
      scheduledEnd: Date.UTC(2026, 8, 3, 13),
      isRecurring: true,
      roomName: "same-grade-other-teacher-guide",
      status: "scheduled",
      createdAt: Date.now(),
      createdBy: otherTeacherId,
    });
    await ctx.db.insert("classSchedule", {
      classId,
      sessionType: "live",
      scheduledStart: Date.UTC(2026, 8, 10, 12),
      scheduledEnd: Date.UTC(2026, 8, 10, 13),
      isRecurring: true,
      roomName: "same-grade-other-teacher-regenerated-guide",
      status: "scheduled",
      createdAt: Date.now(),
      createdBy: otherTeacherId,
    });
    await ctx.db.insert("classSchedule", {
      classId,
      sessionType: "live",
      scheduledStart: Date.UTC(2026, 8, 4, 14),
      scheduledEnd: Date.UTC(2026, 8, 4, 15),
      isRecurring: true,
      roomName: "same-grade-other-teacher-distinct-guide",
      status: "scheduled",
      createdAt: Date.now(),
      createdBy: otherTeacherId,
    });
    return classId;
  });
  const sameGradeScheduleGuides = await asAdmin.query(
    api.classes.listWeeklyScheduleGuides,
    {
      campusId: data.campusId,
      academicPeriodId: data.academicPeriodId,
      gradeCode: "05",
      excludeClassId: sharedCourse.classId,
    },
  );
  expect(sameGradeScheduleGuides).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        classId: sameGradeOtherTeacherCourseId,
        gradeCode: "05",
        isTeacherCourse: false,
      }),
    ]),
  );
  const sameGradeOtherTeacherGuides = sameGradeScheduleGuides.filter(
    (guide) => guide.classId === sameGradeOtherTeacherCourseId,
  );
  expect(sameGradeOtherTeacherGuides).toHaveLength(2);
  expect(sameGradeOtherTeacherGuides).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        dayOfWeek: 4,
        startMinutes: 12 * 60,
        endMinutes: 13 * 60,
      }),
      expect.objectContaining({
        dayOfWeek: 5,
        startMinutes: 14 * 60,
        endMinutes: 15 * 60,
      }),
    ]),
  );
  const teacherScheduleGuides = await asAdmin.query(
    api.classes.listWeeklyScheduleGuides,
    {
      campusId: data.campusId,
      academicPeriodId: data.academicPeriodId,
      gradeCode: "06",
      teacherId: data.teacherId,
      excludeClassId: sharedCourse.classId,
    },
  );
  expect(teacherScheduleGuides).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        classId: result.classId,
        gradeCode: "05",
        isTeacherCourse: true,
        canShare: true,
        isScheduleShared: true,
      }),
    ]),
  );
  const providerCourseIds = await t.run(async (ctx) => {
    const classIds: Id<"classes">[] = [];
    for (const sessionType of ["abeka", "ignitia"] as const) {
      const classId = await ctx.db.insert("classes", {
        name: `${sessionType} course`,
        curriculumId: data.curriculumId,
        teacherId: data.teacherId,
        classType: sessionType,
        academicPeriodId: data.academicPeriodId,
        gradeCode: "05",
        timeZone: "UTC",
        isActive: true,
        createdAt: Date.now(),
        createdBy: data.teacherId,
        campusId: data.campusId,
      });
      await ctx.db.insert("classSchedule", {
        classId,
        sessionType,
        scheduledStart: Date.UTC(2026, 8, 2, 10),
        scheduledEnd: Date.UTC(2026, 8, 2, 11),
        isRecurring: true,
        roomName: `${sessionType}-schedule-guide`,
        status: "scheduled",
        createdAt: Date.now(),
        createdBy: data.teacherId,
      });
      classIds.push(classId);
    }
    return classIds;
  });
  const standardScheduleGuides = await asAdmin.query(
    api.classes.listWeeklyScheduleGuides,
    {
      campusId: data.campusId,
      academicPeriodId: data.academicPeriodId,
      gradeCode: "05",
      teacherId: data.teacherId,
      excludeClassId: sharedCourse.classId,
    },
  );
  expect(
    standardScheduleGuides.some((guide) =>
      providerCourseIds.includes(guide.classId),
    ),
  ).toBe(false);

  await expect(
    asAdmin.mutation(api.classes.createWithSchedule, {
      ...courseArgs,
      name: "Language 5 · Taylor Teacher · 2026-II",
      curriculumId: data.sameGradeCurriculumId,
      studentIds: [],
      approvedScheduleShareIds: [result.classId],
    }),
  ).rejects.toMatchObject({
    data: {
      code: "TEACHER_SCHEDULE_CONFLICT",
      canShare: false,
    },
  });
});
