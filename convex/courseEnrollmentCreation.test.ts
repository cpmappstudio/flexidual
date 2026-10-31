import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
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

async function seedMultiGradeCourse() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-27T12:00:00Z"));
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const adminId = await seedUser(ctx, "multi-admin", "Ada Admin");
    const teacherId = await seedUser(ctx, "multi-teacher", "Main Teacher");
    const gradeTeacherId = await seedUser(
      ctx,
      "multi-grade-teacher",
      "Grade Teacher",
    );
    const unassignedTeacherId = await seedUser(
      ctx,
      "multi-unassigned",
      "Other Teacher",
    );
    const studentId = await seedUser(
      ctx,
      "multi-student-05",
      "Grade Five Student",
    );
    const secondStudentId = await seedUser(
      ctx,
      "multi-student-06",
      "Grade Six Student",
    );
    const notEnrolledId = await seedUser(
      ctx,
      "multi-not-enrolled",
      "Not Enrolled",
    );
    const outsideStudentId = await seedUser(
      ctx,
      "multi-outside",
      "Outside Student",
    );
    const outsideTeacherId = await seedUser(
      ctx,
      "multi-outside-teacher",
      "Outside Teacher",
    );
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "multi-school",
      timeZone: "UTC",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Main",
      slug: "multi-campus",
      timeZone: "UTC",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const outsideCampusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Other",
      slug: "multi-other",
      timeZone: "UTC",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    for (const id of [teacherId, gradeTeacherId, unassignedTeacherId])
      await assignRole(ctx, {
        userId: id,
        schoolId,
        orgId: campusId,
        role: "teacher",
      });
    await assignRole(ctx, {
      userId: outsideTeacherId,
      schoolId,
      orgId: outsideCampusId,
      role: "teacher",
    });
    await assignRole(ctx, {
      userId: adminId,
      schoolId,
      orgId: schoolId,
      role: "admin",
    });
    for (const [userId, gradeCode, orgId] of [
      [studentId, "05", campusId],
      [secondStudentId, "06", campusId],
      [notEnrolledId, "06", campusId],
      [outsideStudentId, "06", outsideCampusId],
    ] as const)
      await assignRole(ctx, {
        userId,
        gradeCode,
        orgId,
        schoolId,
        role: "student",
      });
    for (const code of ["05", "06", "07"])
      await ctx.db.insert("institutionGrades", {
        schoolId,
        code,
        name: `Grade ${code}`,
        order: Number(code),
        createdAt: Date.now(),
        createdBy: adminId,
      });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Shared Science",
      gradeCodes: ["05", "06"],
      schoolId,
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const academicPeriodId = await ctx.db.insert("academicPeriods", {
      schoolId,
      name: "2026",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      createdAt: Date.now(),
      createdBy: adminId,
    });
    return {
      adminId,
      schoolId,
      campusId,
      teacherId,
      gradeTeacherId,
      unassignedTeacherId,
      studentId,
      secondStudentId,
      notEnrolledId,
      outsideStudentId,
      outsideTeacherId,
      curriculumId,
      academicPeriodId,
    };
  });
  const args = {
    name: "Shared private course",
    campusId: data.campusId,
    curriculumId: data.curriculumId,
    academicPeriodId: data.academicPeriodId,
    teacherId: data.teacherId,
    gradeCode: "05",
    gradeAssignments: [
      { gradeCode: "05" },
      { gradeCode: "06", teacherId: data.gradeTeacherId },
    ],
    studentIds: [data.studentId, data.secondStudentId],
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
  return { t, data, args, admin: t.withIdentity({ subject: "multi-admin" }) };
}

test("private multi-grade courses retain campus enrollments, per-grade teachers and the same mandatory calendar", async () => {
  const { t, data, args, admin } = await seedMultiGradeCourse();
  const roster = await admin.query(
    api.classes.listCourseCreationGradeStudents,
    {
      curriculumId: data.curriculumId,
      campusId: data.campusId,
      gradeCode: "05",
      gradeCodes: ["05", "06"],
    },
  );
  expect(roster.map((student) => student._id)).toEqual(
    expect.arrayContaining([
      data.studentId,
      data.secondStudentId,
      data.notEnrolledId,
    ]),
  );
  expect(roster.map((student) => student._id)).not.toContain(
    data.outsideStudentId,
  );
  const { classId } = await admin.mutation(
    api.classes.createWithSchedule,
    args,
  );
  const directory = await t.run((ctx) =>
    ctx.db.query("teacherStudentDirectory").collect(),
  );
  expect(
    new Set(directory.map((row) => `${row.teacherId}:${row.studentId}`)),
  ).toEqual(
    new Set(
      [data.teacherId, data.gradeTeacherId].flatMap((teacherId) =>
        [data.studentId, data.secondStudentId].map(
          (studentId) => `${teacherId}:${studentId}`,
        ),
      ),
    ),
  );
  const range = {
    campusId: data.campusId,
    from: Date.parse("2026-09-01T00:00Z"),
    to: Date.parse("2026-09-08T23:59Z"),
  };
  for (const [subject, teacher] of [
    ["multi-student-05", data.teacherId],
    ["multi-student-06", data.gradeTeacherId],
  ] as const) {
    const client = t.withIdentity({ subject });
    const events = await client.query(api.calendar.listEvents, range);
    expect(events).toHaveLength(2);
    expect(
      events.every(
        (event) => event.classId === classId && event.teacherId === teacher,
      ),
    ).toBe(true);
    const dashboard = await client.query(api.student.getStudentDashboardStats, {
      now: Date.now(),
    });
    expect(dashboard?.classes).toHaveLength(1);
    expect(dashboard?.classes[0].stats.totalClasses).toBe(5);
    expect(dashboard?.classes[0].teacher.fullName).toBe(
      subject.endsWith("06") ? "Grade Teacher" : "Main Teacher",
    );
  }
  const gradeTeacher = t.withIdentity({ subject: "multi-grade-teacher" });
  expect(
    (
      await gradeTeacher.query(api.classes.listOverview, {
        campusId: data.campusId,
      })
    ).classes.map((course) => course._id),
  ).toContain(classId);
  const events = await gradeTeacher.query(api.calendar.listEvents, {
    ...range,
    gradeCode: "06",
    teacherId: data.gradeTeacherId,
  });
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({
    gradeCodes: ["05", "06"],
    teacherIds: [data.teacherId, data.gradeTeacherId],
  });
  expect(
    events.every((event) => event.canLeadSession && event.isAssignedTeacher),
  ).toBe(true);
  expect(
    await t.query(internal.schedule.checkLiveKitAccess, {
      userId: data.gradeTeacherId,
      roomName: events[0].roomName,
      now: events[0].start,
    }),
  ).toMatchObject({
    authorized: true,
    roomAdmin: true,
    computedRole: "teacher",
    leadershipRole: "teacher",
  });
  for (const subject of [
    "multi-not-enrolled",
    "multi-outside",
    "multi-unassigned",
  ]) {
    const client = t.withIdentity({ subject });
    expect(await client.query(api.calendar.listEvents, range)).toEqual([]);
    await expect(
      client.query(api.classes.get, { id: classId }),
    ).rejects.toThrow("PERMISSION_DENIED");
  }
});

test("chat participants include grade teachers exactly once and reflect reassignment without granting outsider access", async () => {
  const { t, data, args, admin } = await seedMultiGradeCourse();
  const { classId } = await admin.mutation(api.classes.createWithSchedule, {
    ...args,
    gradeAssignments: [
      { gradeCode: "05", teacherId: data.teacherId },
      { gradeCode: "06", teacherId: data.gradeTeacherId },
    ],
  });
  await t.run((ctx) => ctx.db.patch(classId, { tutorId: data.teacherId }));
  const context = await t
    .withIdentity({ subject: "multi-grade-teacher" })
    .query(api.classes.getChatContext, { classId });
  expect(context).toMatchObject({ canModerate: true, canDisableChat: false });
  expect(
    context?.participants
      .filter((participant) => participant.role === "teacher")
      .map((participant) => participant._id)
      .sort(),
  ).toEqual([data.teacherId, data.gradeTeacherId].sort());
  expect(
    new Set(context?.participants.map((participant) => participant._id)).size,
  ).toBe(context?.participants.length);
  expect(
    await t
      .withIdentity({ subject: "multi-student-06" })
      .query(api.classes.getChatContext, { classId }),
  ).toMatchObject({ canModerate: false, canDisableChat: false });
  for (const subject of [
    "multi-unassigned",
    "multi-not-enrolled",
    "multi-outside",
  ])
    await expect(
      t
        .withIdentity({ subject })
        .query(api.classes.getChatContext, { classId }),
    ).rejects.toThrow("PERMISSION_DENIED");
  await admin.mutation(api.classes.update, {
    classId,
    gradeAssignments: [
      { gradeCode: "05" },
      { gradeCode: "06", teacherId: data.unassignedTeacherId },
    ],
  });
  await expect(
    t
      .withIdentity({ subject: "multi-grade-teacher" })
      .query(api.classes.getChatContext, { classId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  const updated = await t
    .withIdentity({ subject: "multi-unassigned" })
    .query(api.classes.getChatContext, { classId });
  expect(
    updated?.participants.map((participant) => participant._id),
  ).not.toContain(data.gradeTeacherId);
  expect(updated?.participants).toContainEqual(
    expect.objectContaining({ _id: data.unassignedTeacherId, role: "teacher" }),
  );
});

test("one main teacher can cover every selected grade and deleting the course cleans its assignment indexes", async () => {
  const { t, data, args, admin } = await seedMultiGradeCourse();
  const { classId } = await admin.mutation(api.classes.createWithSchedule, {
    ...args,
    gradeAssignments: [{ gradeCode: "05" }, { gradeCode: "06" }],
  });
  const rows = await t.run((ctx) =>
    ctx.db
      .query("classGradeAssignments")
      .withIndex("by_classId_and_gradeCode", (q) => q.eq("classId", classId))
      .collect(),
  );
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.teacherId === data.teacherId)).toBe(true);
  expect(
    (
      await t
        .withIdentity({ subject: "multi-teacher" })
        .query(api.classes.listOverview, { campusId: data.campusId })
    ).classes,
  ).toHaveLength(1);
  expect(
    (
      await t
        .withIdentity({ subject: "multi-student-06" })
        .query(api.student.getStudentDashboardStats, {})
    )?.classes[0].teacher.fullName,
  ).toBe("Main Teacher");
  await admin.mutation(api.classes.remove, { id: classId });
  expect(
    await t.run((ctx) => ctx.db.query("classGradeAssignments").collect()),
  ).toEqual([]);
});

test("private grade assignments reject cross-campus instructors, unsupported grades and invalid rosters atomically", async () => {
  const { t, data, args, admin } = await seedMultiGradeCourse();
  for (const changes of [
    {
      gradeAssignments: [
        { gradeCode: "05" },
        { gradeCode: "06", teacherId: data.outsideTeacherId },
      ],
    },
    { gradeAssignments: [{ gradeCode: "05" }, { gradeCode: "07" }] },
    { gradeAssignments: [{ gradeCode: "05" }, { gradeCode: "05" }] },
    { gradeAssignments: [] },
    { studentIds: [data.studentId, data.outsideStudentId] },
  ])
    await expect(
      admin.mutation(api.classes.createWithSchedule, { ...args, ...changes }),
    ).rejects.toThrow();
  await t.run(async (ctx) => {
    expect(await ctx.db.query("classes").collect()).toEqual([]);
    expect(await ctx.db.query("classGradeAssignments").collect()).toEqual([]);
    expect(await ctx.db.query("classEnrollments").collect()).toEqual([]);
  });
});

test("editing grade teachers updates indexed access and notifications without resetting enrollments or attendance", async () => {
  const { t, data, args, admin } = await seedMultiGradeCourse();
  const { classId } = await admin.mutation(
    api.classes.createWithSchedule,
    args,
  );
  const previous = await t.run(async (ctx) => ({
    schedules: await ctx.db
      .query("classSchedule")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .collect(),
    enrollments: await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .collect(),
  }));
  await t.run((ctx) =>
    ctx.db.insert("studentAttendanceRecords", {
      scheduleId: previous.schedules[0]._id,
      studentId: data.secondStudentId,
      status: "present",
      confirmedBy: data.teacherId,
      confirmedAt: Date.now(),
      lastUpdatedBy: data.teacherId,
      lastUpdatedAt: Date.now(),
    }),
  );
  await admin.mutation(api.classes.update, {
    classId,
    gradeAssignments: [
      { gradeCode: "05" },
      { gradeCode: "06", teacherId: data.unassignedTeacherId },
    ],
  });
  await expect(
    t
      .withIdentity({ subject: "multi-grade-teacher" })
      .query(api.classes.get, { id: classId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await t
      .withIdentity({ subject: "multi-unassigned" })
      .query(api.classes.get, { id: classId }),
  ).not.toBeNull();
  await expect(
    admin.mutation(api.classes.update, {
      classId,
      gradeAssignments: [{ gradeCode: "05" }],
    }),
  ).rejects.toThrow("INVALID_STUDENTS");
  for (const liveAccess of [
    { mode: "school" as const, allowedGradeCodes: ["05", "06"] },
    args.liveAccess,
  ]) {
    await admin.mutation(api.classes.update, { classId, liveAccess });
    expect(await t.run((ctx) => ctx.db.get("classes", classId))).toMatchObject({
      gradeAssignments: [
        { gradeCode: "05" },
        { gradeCode: "06", teacherId: data.unassignedTeacherId },
      ],
      liveAccess,
    });
  }
  await t.run(async (ctx) => {
    expect(
      await ctx.db
        .query("classEnrollments")
        .withIndex("by_class", (q) => q.eq("classId", classId))
        .collect(),
    ).toEqual(previous.enrollments);
    expect(
      await ctx.db
        .query("classSchedule")
        .withIndex("by_class", (q) => q.eq("classId", classId))
        .collect(),
    ).toEqual(previous.schedules);
    expect(
      await ctx.db.query("studentAttendanceRecords").collect(),
    ).toHaveLength(1);
    const notifications = await ctx.db.query("systemNotifications").collect();
    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientId: data.gradeTeacherId,
          action: "removed",
        }),
        expect.objectContaining({
          recipientId: data.unassignedTeacherId,
          action: "added",
        }),
      ]),
    );
  });
});

test("secondary grade instructors cannot be double-booked by course creation or schedule edits", async () => {
  const { t, data, args, admin } = await seedMultiGradeCourse();
  const { classId } = await admin.mutation(
    api.classes.createWithSchedule,
    args,
  );
  const curriculumId = await t.run((ctx) =>
    ctx.db.insert("curriculums", {
      title: "Other subject",
      gradeCodes: ["05", "06"],
      schoolId: data.schoolId,
      isActive: true,
      createdAt: Date.now(),
      createdBy: data.adminId,
    }),
  );
  await expect(
    admin.mutation(api.classes.createWithSchedule, {
      ...args,
      curriculumId,
      teacherId: data.gradeTeacherId,
      gradeAssignments: [{ gradeCode: "05" }, { gradeCode: "06" }],
      studentIds: [],
    }),
  ).rejects.toThrow("TEACHER_SCHEDULE_CONFLICT");
  const other = await admin.mutation(api.classes.createWithSchedule, {
    ...args,
    curriculumId,
    teacherId: data.unassignedTeacherId,
    gradeAssignments: [{ gradeCode: "05" }],
    studentIds: [],
    weeklySlots: [
      {
        dayOfWeek: 2,
        startMinutes: 11 * 60,
        durationMinutes: 60,
        sessionType: "live",
      },
    ],
  });
  await expect(
    admin.mutation(api.classes.update, {
      classId: other.classId,
      gradeAssignments: [{ gradeCode: "05", teacherId: data.gradeTeacherId }],
      weeklySlots: args.weeklySlots,
    }),
  ).rejects.toThrow("TEACHER_SCHEDULE_CONFLICT");
  expect(
    (await admin.query(api.classes.get, { id: classId }))?.gradeAssignments,
  ).toEqual(args.gradeAssignments);
});

test.each([false, true])(
  "schedule edits revalidate all grades of an approved share and roll back conflicts (series: %s)",
  async (updateSeries) => {
    const { t, data, args, admin } = await seedMultiGradeCourse();
    const first = await admin.mutation(api.classes.createWithSchedule, {
      ...args,
      gradeAssignments: [{ gradeCode: "05" }],
      studentIds: [data.studentId],
    });
    const second = await admin.mutation(api.classes.createWithSchedule, {
      ...args,
      gradeCode: "06",
      gradeAssignments: [{ gradeCode: "06" }],
      studentIds: [data.secondStudentId],
      approvedScheduleShareIds: [first.classId],
    });
    const schedules = await t.run((ctx) =>
      ctx.db
        .query("classSchedule")
        .withIndex("by_class", (q) => q.eq("classId", first.classId))
        .collect(),
    );
    const move = {
      id: schedules[0]._id,
      durationMinutes: 60,
      updateSeries: true,
    };
    // Approved cross-grade sharing must remain usable before the grades overlap.
    for (const hour of ["11", "09", "11"])
      await admin.mutation(api.schedule.updateSchedule, {
        ...move,
        localStart: `2026-09-01T${hour}:00`,
      });
    await admin.mutation(api.classes.update, {
      classId: first.classId,
      gradeAssignments: args.gradeAssignments,
    });
    if (updateSeries) {
      const secondSchedule = await t.run((ctx) =>
        ctx.db
          .query("classSchedule")
          .withIndex("by_class", (q) => q.eq("classId", second.classId))
          .first(),
      );
      // Let the first edit succeed, so a later occurrence must roll it back.
      await admin.mutation(api.schedule.updateSchedule, {
        id: secondSchedule!._id,
        localStart: "2026-09-01T13:00",
        durationMinutes: 60,
      });
    }
    await t.run(async (ctx) => {
      const pastScheduleId = await ctx.db.insert("classSchedule", {
        classId: first.classId,
        schoolId: data.schoolId,
        scheduledStart: Date.parse("2026-08-25T09:00Z"),
        scheduledEnd: Date.parse("2026-08-25T10:00Z"),
        status: "completed",
        roomName: "past-multi-grade-class",
        createdBy: data.teacherId,
        createdAt: Date.now(),
      });
      const lessonId = await ctx.db.insert("lessons", {
        curriculumId: data.curriculumId,
        title: "Completed lesson",
        order: 1,
        isActive: true,
        createdBy: data.teacherId,
        createdAt: Date.now(),
      });
      const reportId = await ctx.db.insert("classSessionReports", {
        classId: first.classId,
        scheduleId: pastScheduleId,
        closedBy: data.teacherId,
        closedAt: Date.now(),
      });
      await ctx.db.insert("classSessionReportLessons", {
        reportId,
        classId: first.classId,
        scheduleId: pastScheduleId,
        lessonId,
      });
      await ctx.db.insert("studentAttendanceRecords", {
        scheduleId: pastScheduleId,
        studentId: data.studentId,
        status: "present",
        confirmedBy: data.teacherId,
        confirmedAt: Date.now(),
        lastUpdatedBy: data.teacherId,
        lastUpdatedAt: Date.now(),
      });
    });
    const snapshot = () =>
      t.run(async (ctx) => ({
        courses: await ctx.db.query("classes").collect(),
        schedules: await ctx.db.query("classSchedule").collect(),
        shares: await ctx.db.query("courseScheduleShares").collect(),
        enrollments: await ctx.db.query("classEnrollments").collect(),
        attendance: await ctx.db.query("studentAttendanceRecords").collect(),
        reports: await ctx.db.query("classSessionReports").collect(),
        lessons: await ctx.db.query("classSessionReportLessons").collect(),
      }));
    const before = await snapshot();
    await expect(
      t
        .withIdentity({ subject: "multi-grade-teacher" })
        .mutation(api.schedule.updateSchedule, {
          ...move,
          updateSeries,
          localStart: "2026-09-01T09:00",
        }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      admin.mutation(api.schedule.updateSchedule, {
        ...move,
        updateSeries,
        localStart: "2026-09-01T09:00",
      }),
    ).rejects.toThrow("TEACHER_SCHEDULE_CONFLICT");
    expect(await snapshot()).toEqual(before);
  },
);

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
    const otherCampusStudentId = await seedUser(
      ctx,
      "other-campus-student",
      "Casey Other Campus",
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
    const otherCampusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Other Campus",
      slug: "other-enrollment-campus",
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
      assignRole(ctx, {
        userId: otherCampusStudentId,
        schoolId,
        orgId: otherCampusId,
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
      adminId,
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
      otherCampusStudentId,
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
      gradeCode: "05",
    },
  );
  expect(searchResults).toEqual([]);

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

  for (const studentId of [
    data.otherGradeStudentId,
    data.otherCampusStudentId,
  ]) {
    await expect(
      asAdmin.mutation(api.classes.createWithSchedule, {
        ...courseArgs,
        studentIds: [studentId],
      }),
    ).rejects.toThrow("INVALID_STUDENTS");
  }

  const result = await asAdmin.mutation(api.classes.createWithSchedule, {
    ...courseArgs,
    studentIds: [data.activeStudentId, data.inactiveStudentId],
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
  ).toEqual([data.activeStudentId, data.inactiveStudentId]);
  expect(
    await asAdmin.query(api.classes.getStudents, { classId: result.classId }),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        _id: data.activeStudentId,
        gradeCode: "05",
        gradeName: "5th Grade",
        campusName: "Main Campus",
      }),
    ]),
  );

  const mismatchedEnrollmentId = await t.run((ctx) =>
    ctx.db.insert("classEnrollments", {
      classId: result.classId,
      studentId: data.otherCampusStudentId,
      enrolledAt: Date.now(),
      enrolledBy: data.adminId,
    }),
  );
  expect(
    await asAdmin.query(api.classes.getStudents, { classId: result.classId }),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        _id: data.otherCampusStudentId,
        campusName: "Other Campus",
      }),
    ]),
  );
  await t.run((ctx) =>
    ctx.db.delete("classEnrollments", mismatchedEnrollmentId),
  );

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

  await t.run(async (ctx) => {
    const avatarStorageId = await ctx.storage.store(
      new Blob(["avatar"], { type: "image/png" }),
    );
    await ctx.db.patch("users", data.activeStudentId, { avatarStorageId });
  });
  const enrollmentCandidates = await asAdmin.query(api.classes.searchStudents, {
    classId: principalCourse.classId,
  });
  expect(
    enrollmentCandidates.find((student) => student._id === data.activeStudentId)
      ?.imageUrl,
  ).toBeTruthy();
  expect(enrollmentCandidates.every((student) => student.grade === "05")).toBe(
    true,
  );
  expect(enrollmentCandidates.map((student) => student._id)).not.toContain(
    data.otherGradeStudentId,
  );
  expect(enrollmentCandidates.map((student) => student._id)).not.toContain(
    data.otherCampusStudentId,
  );
  for (const studentId of [
    data.otherGradeStudentId,
    data.otherCampusStudentId,
  ]) {
    await expect(
      asAdmin.mutation(api.classes.addStudent, {
        classId: principalCourse.classId,
        studentId,
      }),
    ).rejects.toThrow("INVALID_STUDENT");
  }

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

  // An existing legacy cross-grade roster still blocks shared schedules.
  const legacyCrossGradeEnrollment = await t.run((ctx) =>
    ctx.db.insert("classEnrollments", {
      classId: result.classId,
      studentId: data.otherGradeStudentId,
      enrolledAt: Date.now(),
      enrolledBy: data.adminId,
    }),
  );

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
  await t.run((ctx) => ctx.db.delete(legacyCrossGradeEnrollment));

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
  const scheduleGuidesWithProviders = await asAdmin.query(
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
    scheduleGuidesWithProviders
      .filter((guide) => providerCourseIds.includes(guide.classId))
      .map((guide) => guide.sessionType)
      .sort(),
  ).toEqual(["abeka", "ignitia"]);

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

  // Course edits may not silently invalidate the current roster.
  await expect(
    asAdmin.mutation(api.classes.update, {
      classId: result.classId,
      gradeCode: "06",
      curriculumId: data.otherGradeCurriculumId,
    }),
  ).rejects.toThrow("INVALID_STUDENTS");

  const history = await t.run(async (ctx) => {
    const course = (await ctx.db.get(result.classId))!;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit system fields when cloning the fixture
    const { _id, _creationTime, ...fields } = course;
    const pastClassId = await ctx.db.insert("classes", {
      ...fields,
      endDate: Date.now() - 1,
    });
    await ctx.db.insert("classEnrollments", {
      classId: pastClassId,
      studentId: data.inactiveStudentId,
      enrolledAt: Date.now(),
      enrolledBy: data.adminId,
    });
    const legacyClassId = await ctx.db.insert("classes", {
      ...fields,
      endDate: undefined,
      enrollmentsMigratedAt: undefined,
      students: [data.inactiveStudentId, data.activeStudentId],
    });
    const compatibleClassId = await ctx.db.insert("classes", {
      ...fields,
      curriculumId: data.otherGradeCurriculumId,
      gradeCode: "06",
    });
    await ctx.db.insert("classEnrollments", {
      classId: compatibleClassId,
      studentId: data.inactiveStudentId,
      enrolledAt: Date.now(),
      enrolledBy: data.adminId,
    });
    // A stale users.grade must not override the campus grade after editing.
    await ctx.db.patch(data.inactiveStudentId, { grade: "05" });
    return {
      pastClassId,
      legacyClassId,
      compatibleClassId,
      scheduleCount: (await ctx.db.query("classSchedule").collect()).length,
    };
  });
  await t.mutation(internal.roleAssignments.assignRoleInternal, {
    userId: data.inactiveStudentId,
    orgType: "campus",
    orgId: data.campusId,
    role: "student",
    gradeCode: "06",
  });
  const afterGradeChange = await t.run(async (ctx) => ({
    enrollments: await ctx.db
      .query("classEnrollments")
      .withIndex("by_student", (q) => q.eq("studentId", data.inactiveStudentId))
      .collect(),
    legacy: await ctx.db.get(history.legacyClassId),
    scheduleCount: (await ctx.db.query("classSchedule").collect()).length,
  }));
  expect(afterGradeChange.enrollments.map((e) => e.classId).sort()).toEqual(
    [history.pastClassId, history.compatibleClassId].sort(),
  );
  expect(afterGradeChange.legacy?.students).toEqual([data.activeStudentId]);
  expect(afterGradeChange.scheduleCount).toBe(history.scheduleCount);
  await expect(
    asAdmin.mutation(api.classes.addStudent, {
      classId: principalCourse.classId,
      studentId: data.inactiveStudentId,
    }),
  ).rejects.toThrow("INVALID_STUDENT");
});
