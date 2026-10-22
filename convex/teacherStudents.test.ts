import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { syncCourseGradeAssignments } from "./model/courseAssignments";

async function setup(migrated = true) {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const now = Date.now();
    const createUser = (name: string) =>
      ctx.db.insert("users", {
        clerkId: name,
        firstName: name,
        lastName: "Test",
        fullName: `${name} Test`,
        isActive: true,
        createdAt: now,
        externalPassword: "never-expose",
      });
    const teacherId = await createUser("teacher");
    const gradeTeacherId = await createUser("grade-teacher");
    const otherTeacherId = await createUser("other-teacher");
    const adminId = await createUser("admin");
    const studentId = await createUser("student");
    const otherStudentId = await createUser("other-student");
    const outsideStudentId = await createUser("outside-student");
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      timeZone: "America/Bogota",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus",
      slug: "campus",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const otherCampusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Other",
      slug: "other-campus",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    for (const userId of [
      teacherId,
      gradeTeacherId,
      otherTeacherId,
      adminId,
      studentId,
      otherStudentId,
      outsideStudentId,
    ]) {
      const role =
        userId === adminId
          ? "admin"
          : [teacherId, gradeTeacherId, otherTeacherId].includes(userId)
            ? "teacher"
            : "student";
      await ctx.db.insert("roleAssignments", {
        userId,
        orgType: role === "admin" ? "school" : "campus",
        orgId:
          role === "admin"
            ? schoolId
            : userId === outsideStudentId
              ? otherCampusId
              : campusId,
        schoolId,
        role,
        gradeCode: role === "student" ? "05" : undefined,
        assignedAt: now,
        assignedBy: adminId,
      });
    }
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId,
      title: "Science",
      gradeCodes: ["05", "06"],
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const academicPeriodId = await ctx.db.insert("academicPeriods", {
      schoolId,
      name: "Period",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      createdAt: now,
      createdBy: adminId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Science",
      campusId,
      schoolId,
      curriculumId,
      academicPeriodId,
      teacherId,
      gradeCode: "05",
      gradeAssignments: [
        { gradeCode: "05" },
        { gradeCode: "06", teacherId: gradeTeacherId },
      ],
      students: [studentId],
      enrollmentsMigratedAt: migrated ? now : undefined,
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    await syncCourseGradeAssignments(
      ctx,
      (await ctx.db.get("classes", classId))!,
    );
    if (migrated)
      await ctx.db.insert("classEnrollments", {
        classId,
        studentId,
        enrolledAt: now,
        enrolledBy: adminId,
      });
    const otherClassId = await ctx.db.insert("classes", {
      name: "Other Science",
      campusId,
      schoolId,
      curriculumId,
      teacherId: otherTeacherId,
      students: [studentId, otherStudentId],
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      scheduledStart: now - 3_600_000,
      scheduledEnd: now - 1,
      roomName: "finished",
      status: "completed",
      sessionClosureStatus: "completed",
      createdAt: now,
      createdBy: teacherId,
    });
    const otherScheduleId = await ctx.db.insert("classSchedule", {
      classId: otherClassId,
      scheduledStart: now - 3_600_000,
      scheduledEnd: now - 1,
      roomName: "other-finished",
      status: "completed",
      sessionClosureStatus: "completed",
      createdAt: now,
      createdBy: otherTeacherId,
    });
    for (const id of [scheduleId, otherScheduleId])
      await ctx.db.insert("studentAttendanceRecords", {
        scheduleId: id,
        studentId,
        status: "present",
        confirmedBy: adminId,
        confirmedAt: now,
        lastUpdatedBy: adminId,
        lastUpdatedAt: now,
      });
    return {
      teacherId,
      gradeTeacherId,
      otherTeacherId,
      adminId,
      studentId,
      otherStudentId,
      outsideStudentId,
      campusId,
      otherCampusId,
      classId,
      scheduleId,
      otherScheduleId,
    };
  });
  const teacher = t.withIdentity({ subject: "teacher" });
  return { t, data, teacher };
}

test.each([false, true])(
  "teacher roster and profiles use existing enrollments (migrated=%s)",
  async (migrated) => {
    const { t, data, teacher } = await setup(migrated);
    const list = {
      orgType: "campus" as const,
      orgId: data.campusId,
      role: "student" as const,
    };
    const roster = await teacher.query(api.users.getUsers, list);
    expect(roster.map(({ _id }) => _id)).toEqual([data.studentId]);
    expect(roster[0]).not.toHaveProperty("externalPassword");
    const target = { studentId: data.studentId, orgSlug: "campus" };
    expect(
      (
        await teacher.query(api.classes.getStudents, { classId: data.classId })
      ).map(({ _id }) => _id),
    ).toEqual([data.studentId]);
    const chat = await teacher.query(api.classes.getChatContext, {
      classId: data.classId,
    });
    expect(chat?.canModerate).toBe(true);
    expect(chat?.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: data.studentId, role: "student" }),
      ]),
    );
    const profile = await teacher.query(
      api.student.getStudentDashboardStats,
      target,
    );
    expect(profile?.student._id).toBe(data.studentId);
    expect(profile?.canEdit).toBe(false);
    expect(profile?.classes).toHaveLength(2);
    const history = await teacher.query(
      api.student.listStudentAttendanceHistory,
      { ...target, paginationOpts: { numItems: 10, cursor: null } },
    );
    expect(history.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scheduleId: data.scheduleId,
          canEditAttendance: true,
        }),
        expect.objectContaining({
          scheduleId: data.otherScheduleId,
          canEditAttendance: false,
        }),
      ]),
    );
    await teacher.mutation(api.schedule.updateAttendance, {
      scheduleId: data.scheduleId,
      studentId: data.studentId,
      status: "excused",
      excuseReason: "Medical",
    });
    await expect(
      teacher.mutation(api.schedule.updateAttendance, {
        scheduleId: data.otherScheduleId,
        studentId: data.studentId,
        status: "absent",
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      teacher.query(internal.users.assertCanManageUsers, {
        orgType: "campus",
        orgId: data.campusId,
        roles: ["student"],
      }),
    ).rejects.toThrow("Unauthorized");
    for (const studentId of [data.otherStudentId, data.outsideStudentId]) {
      expect(
        await teacher.query(api.student.getStudentDashboardStats, {
          studentId,
          orgSlug: "campus",
        }),
      ).toBeNull();
      await expect(
        teacher.query(api.student.listStudentAttendanceHistory, {
          studentId,
          orgSlug: "campus",
          paginationOpts: { numItems: 10, cursor: null },
        }),
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(
        await teacher.query(api.courseTasks.listMyPending, {
          studentId,
          orgSlug: "campus",
          now: Date.now(),
          classIds: [data.classId],
        }),
      ).toEqual([]);
    }
    const gradeTeacher = t.withIdentity({ subject: "grade-teacher" });
    expect(
      (await gradeTeacher.query(api.users.getUsers, list)).map(
        ({ _id }) => _id,
      ),
    ).toEqual([data.studentId]);
    expect(
      (await gradeTeacher.query(api.student.getStudentDashboardStats, target))
        ?.canEdit,
    ).toBe(false);
    const admin = t.withIdentity({ subject: "admin" });
    expect(
      (await admin.query(api.users.getUsers, list)).map(({ _id }) => _id),
    ).toEqual(expect.arrayContaining([data.studentId, data.otherStudentId]));
    expect(
      (await admin.query(api.student.getStudentDashboardStats, target))
        ?.canEdit,
    ).toBe(true);
    const context = await teacher.query(api.organizations.getStaffContext, {
      orgSlug: "campus",
    });
    expect(context).toMatchObject({
      canViewStudents: true,
      canViewPeople: false,
      canManagePeople: false,
    });
  },
);

test("teacher listing fails closed for other scopes, mixed roles and removed assignments", async () => {
  const { t, data, teacher } = await setup();
  const deniedRequests: FunctionArgs<typeof api.users.getUsers>[] = [
    {},
    { orgType: "campus" as const, orgId: data.campusId },
    {
      orgType: "campus" as const,
      orgId: data.campusId,
      roles: ["student", "teacher"],
    },
    {
      orgType: "campus" as const,
      orgId: data.otherCampusId,
      role: "student" as const,
    },
  ];
  for (const args of deniedRequests)
    await expect(teacher.query(api.users.getUsers, args)).rejects.toThrow(
      "PERMISSION_DENIED",
    );
  await t.run((ctx) =>
    ctx.db.patch("classes", data.classId, { teacherId: data.otherTeacherId }),
  );
  expect(
    await teacher.query(api.users.getUsers, {
      orgType: "campus",
      orgId: data.campusId,
      role: "student",
    }),
  ).toEqual([]);
  expect(
    await teacher.query(api.student.getStudentDashboardStats, {
      studentId: data.studentId,
      orgSlug: "campus",
    }),
  ).toBeNull();
});

test("removing enrollment or the teacher role revokes the student profile", async () => {
  const { t, data, teacher } = await setup();
  const target = { studentId: data.studentId, orgSlug: "campus" };
  await t.run(async (ctx) => {
    for await (const row of ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) => q.eq("classId", data.classId))) {
      await ctx.db.delete("classEnrollments", row._id);
    }
  });
  expect(
    await teacher.query(api.student.getStudentDashboardStats, target),
  ).toBeNull();
  expect(
    await teacher.query(api.users.getUsers, {
      orgType: "campus",
      orgId: data.campusId,
      role: "student",
    }),
  ).toEqual([]);
  await t.run(async (ctx) => {
    await ctx.db.insert("classEnrollments", {
      classId: data.classId,
      studentId: data.studentId,
      enrolledAt: Date.now(),
      enrolledBy: data.adminId,
    });
    for await (const role of ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", data.teacherId))) {
      await ctx.db.delete("roleAssignments", role._id);
    }
  });
  expect(
    await teacher.query(api.student.getStudentDashboardStats, target),
  ).toBeNull();
  await expect(
    teacher.query(api.users.getUsers, {
      orgType: "campus",
      orgId: data.campusId,
      role: "student",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});
