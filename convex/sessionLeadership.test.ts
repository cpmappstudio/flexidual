import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { STUDENT_ONLY_GRACE_MS } from "../lib/live-session-policy";

const NOW = Date.UTC(2026, 7, 26, 15, 0, 0);

afterEach(() => {
  vi.useRealTimers();
});

async function setupLeadershipTest() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const createUser = (clerkId: string, fullName: string) => {
      const [firstName, ...lastNameParts] = fullName.split(" ");
      return ctx.db.insert("users", {
        clerkId,
        firstName,
        lastName: lastNameParts.join(" "),
        fullName,
        isActive: true,
        createdAt: NOW,
      });
    };
    const teacherId = await createUser("leader-teacher", "Taylor Teacher");
    const otherTeacherId = await createUser(
      "leader-other-teacher",
      "Uma Teacher",
    );
    const principalId = await createUser(
      "leader-principal",
      "Parker Principal",
    );
    const adminId = await createUser("leader-admin", "Avery Admin");
    const campusAdminId = await createUser(
      "leader-campus-admin",
      "Casey Campus Admin",
    );
    const superadminId = await createUser(
      "leader-superadmin",
      "Sky Superadmin",
    );
    const outOfScopeAdminId = await createUser(
      "leader-out-of-scope-admin",
      "Owen Outside Admin",
    );
    const inactiveAdminId = await createUser(
      "leader-inactive-admin",
      "Ivy Inactive Admin",
    );
    const tutorId = await createUser("leader-tutor", "Terry Tutor");
    const studentId = await createUser("leader-student", "Sam Student");
    const secondStudentId = await createUser(
      "leader-student-two",
      "Riley Student",
    );
    const thirdStudentId = await createUser(
      "leader-student-three",
      "Jordan Student",
    );
    const fourthStudentId = await createUser(
      "leader-student-four",
      "Morgan Student",
    );
    const schoolId = await ctx.db.insert("schools", {
      name: "Leadership School",
      slug: "leadership-school",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Main Campus",
      slug: "leadership-campus",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const otherSchoolId = await ctx.db.insert("schools", {
      name: "Other Leadership School",
      slug: "other-leadership-school",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const assignments = [
      { userId: teacherId, role: "teacher" as const },
      { userId: otherTeacherId, role: "teacher" as const },
      { userId: principalId, role: "principal" as const },
      { userId: tutorId, role: "tutor" as const },
      { userId: campusAdminId, role: "admin" as const },
    ];
    for (const assignment of assignments) {
      await ctx.db.insert("roleAssignments", {
        ...assignment,
        orgId: campusId,
        orgType: "campus",
        schoolId,
        assignedAt: NOW,
        assignedBy: adminId,
      });
    }
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgId: schoolId,
      orgType: "school",
      role: "admin",
      schoolId,
      assignedAt: NOW,
      assignedBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: superadminId,
      orgType: "system",
      role: "superadmin",
      assignedAt: NOW,
      assignedBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: outOfScopeAdminId,
      orgId: otherSchoolId,
      orgType: "school",
      role: "admin",
      schoolId: otherSchoolId,
      assignedAt: NOW,
      assignedBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: inactiveAdminId,
      orgId: schoolId,
      orgType: "school",
      role: "admin",
      schoolId,
      assignedAt: NOW,
      assignedBy: adminId,
    });
    await ctx.db.patch(inactiveAdminId, { isActive: false });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Leadership Curriculum",
      schoolId,
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const lessonId = await ctx.db.insert("lessons", {
      curriculumId,
      title: "Session leadership",
      order: 1,
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const inactiveLessonId = await ctx.db.insert("lessons", {
      curriculumId,
      title: "Inactive session lesson",
      order: 2,
      isActive: false,
      createdAt: NOW,
      createdBy: adminId,
    });
    const foreignCurriculumId = await ctx.db.insert("curriculums", {
      title: "Foreign Leadership Curriculum",
      schoolId,
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const foreignLessonId = await ctx.db.insert("lessons", {
      curriculumId: foreignCurriculumId,
      title: "Foreign session lesson",
      order: 1,
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Leadership Class",
      curriculumId,
      schoolId,
      campusId,
      teacherId,
      tutorId,
      students: [studentId, secondStudentId, thirdStudentId, fourthStudentId],
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const createSchedule = (roomName: string) =>
      ctx.db.insert("classSchedule", {
        classId,
        schoolId,
        sessionType: "live",
        scheduledStart: NOW - 60_000,
        scheduledEnd: NOW + 60 * 60_000,
        roomName,
        isLive: false,
        status: "scheduled",
        createdAt: NOW,
        createdBy: adminId,
      });
    const teacherScheduleId = await createSchedule("teacher-led-room");
    const adminScheduleId = await createSchedule("admin-led-room");
    const tutorScheduleId = await createSchedule("tutor-room");
    const principalScheduleId = await createSchedule("principal-led-room");
    const superadminScheduleId = await createSchedule("superadmin-led-room");
    const campusAdminScheduleId = await createSchedule("campus-admin-led-room");
    const deniedScheduleId = await createSchedule("denied-room");
    const transferScheduleId = await createSchedule("transfer-room");
    const concurrentScheduleId = await createSchedule("concurrent-room");
    const principalRecoveryScheduleId = await createSchedule(
      "principal-recovery-room",
    );
    const adminRecoveryScheduleId = await createSchedule("admin-recovery-room");
    const superadminRecoveryScheduleId = await createSchedule(
      "superadmin-recovery-room",
    );
    const endGateScheduleId = await createSchedule("end-gate-room");
    return {
      teacherId,
      otherTeacherId,
      principalId,
      adminId,
      campusAdminId,
      superadminId,
      outOfScopeAdminId,
      inactiveAdminId,
      tutorId,
      studentId,
      secondStudentId,
      thirdStudentId,
      fourthStudentId,
      classId,
      curriculumId,
      lessonId,
      inactiveLessonId,
      foreignLessonId,
      teacherScheduleId,
      adminScheduleId,
      tutorScheduleId,
      principalScheduleId,
      superadminScheduleId,
      campusAdminScheduleId,
      deniedScheduleId,
      transferScheduleId,
      concurrentScheduleId,
      principalRecoveryScheduleId,
      adminRecoveryScheduleId,
      superadminRecoveryScheduleId,
      endGateScheduleId,
    };
  });
  return { t, data };
}

type LeadershipTestData = Awaited<
  ReturnType<typeof setupLeadershipTest>
>["data"];

function buildAttendance(
  data: LeadershipTestData,
  statuses: readonly [
    "present" | "absent" | "partial" | "excused",
    "present" | "absent" | "partial" | "excused",
    "present" | "absent" | "partial" | "excused",
    "present" | "absent" | "partial" | "excused",
  ] = ["present", "partial", "excused", "absent"],
) {
  return [
    {
      studentId: data.studentId,
      status: statuses[0],
      excuseReason:
        statuses[0] === "excused" ? "Medical appointment" : undefined,
    },
    {
      studentId: data.secondStudentId,
      status: statuses[1],
      excuseReason:
        statuses[1] === "excused" ? "Medical appointment" : undefined,
    },
    {
      studentId: data.thirdStudentId,
      status: statuses[2],
      excuseReason:
        statuses[2] === "excused" ? "Medical appointment" : undefined,
    },
    {
      studentId: data.fourthStudentId,
      status: statuses[3],
      excuseReason:
        statuses[3] === "excused" ? "Medical appointment" : undefined,
    },
  ];
}

test("starting a class assigns one persistent session leader", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });

  await teacher.mutation(api.schedule.markLive, {
    roomName: "teacher-led-room",
    isLive: true,
  });

  const schedule = await t.run((ctx) =>
    ctx.db.get("classSchedule", data.teacherScheduleId),
  );
  expect(schedule).toMatchObject({
    sessionLeaderId: data.teacherId,
    sessionLeaderRole: "teacher",
    sessionStartedBy: data.teacherId,
    sessionStartedAt: NOW,
    sessionClosureStatus: "pending",
  });
  expect(
    await teacher.query(api.schedule.getSessionLeadership, {
      roomName: "teacher-led-room",
      now: NOW,
    }),
  ).toMatchObject({
    leader: { fullName: "Taylor Teacher", role: "teacher" },
    viewer: { isLeader: true, canTransfer: true },
  });

  const tutor = t.withIdentity({ subject: "leader-tutor" });
  expect(
    await tutor.query(api.schedule.getSessionStatus, {
      sessionId: "teacher-led-room",
      now: NOW,
    }),
  ).toMatchObject({
    roomAdmin: true,
    isSessionLeader: false,
    leadershipRole: null,
  });
  await expect(
    tutor.mutation(api.schedule.markLive, {
      roomName: "tutor-room",
      isLive: true,
    }),
  ).rejects.toThrow("assigned teacher or an authorized administrator");
});

test("principal, campus administrator, and superadmin can lead within scope", async () => {
  const { t, data } = await setupLeadershipTest();
  const principal = t.withIdentity({ subject: "leader-principal" });
  const campusAdmin = t.withIdentity({ subject: "leader-campus-admin" });
  const superadmin = t.withIdentity({ subject: "leader-superadmin" });

  await principal.mutation(api.schedule.markLive, {
    roomName: "principal-led-room",
    isLive: true,
  });
  await campusAdmin.mutation(api.schedule.markLive, {
    roomName: "campus-admin-led-room",
    isLive: true,
  });
  await superadmin.mutation(api.schedule.markLive, {
    roomName: "superadmin-led-room",
    isLive: true,
  });

  const schedules = await t.run(async (ctx) =>
    Promise.all([
      ctx.db.get("classSchedule", data.principalScheduleId),
      ctx.db.get("classSchedule", data.campusAdminScheduleId),
      ctx.db.get("classSchedule", data.superadminScheduleId),
    ]),
  );
  expect(schedules.map((schedule) => schedule?.sessionLeaderRole)).toEqual([
    "principal",
    "admin",
    "superadmin",
  ]);
});

test("students, unrelated teachers, and out-of-scope administrators cannot lead", async () => {
  const { t } = await setupLeadershipTest();
  const deniedActors = [
    t.withIdentity({ subject: "leader-student" }),
    t.withIdentity({ subject: "leader-other-teacher" }),
    t.withIdentity({ subject: "leader-out-of-scope-admin" }),
  ];

  for (const actor of deniedActors) {
    await expect(
      actor.mutation(api.schedule.markLive, {
        roomName: "denied-room",
        isLive: true,
      }),
    ).rejects.toThrow("assigned teacher or an authorized administrator");
  }
});

test("leadership transfers explicitly and the assigned teacher can recover it", async () => {
  const { t, data } = await setupLeadershipTest();
  const admin = t.withIdentity({ subject: "leader-admin" });
  const principal = t.withIdentity({ subject: "leader-principal" });
  const teacher = t.withIdentity({ subject: "leader-teacher" });

  await admin.mutation(api.schedule.markLive, {
    roomName: "admin-led-room",
    isLive: true,
  });
  await expect(
    principal.mutation(api.schedule.claimSessionLeadership, {
      roomName: "admin-led-room",
    }),
  ).rejects.toThrow("already has a session leader");

  await admin.mutation(api.schedule.requestSessionLeadershipTransfer, {
    roomName: "admin-led-room",
    targetUserId: data.principalId,
  });
  await principal.mutation(api.schedule.acceptSessionLeadershipTransfer, {
    roomName: "admin-led-room",
  });
  await teacher.mutation(api.schedule.recoverSessionLeadership, {
    roomName: "admin-led-room",
  });

  const schedule = await t.run((ctx) =>
    ctx.db.get("classSchedule", data.adminScheduleId),
  );
  expect(schedule).toMatchObject({
    sessionLeaderId: data.teacherId,
    sessionLeaderRole: "teacher",
  });
  const events = await t.run((ctx) =>
    ctx.db
      .query("classSessionLeadershipEvents")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", data.adminScheduleId))
      .collect(),
  );
  expect(events.map((event) => event.eventType)).toEqual([
    "started",
    "transferred",
    "recovered",
  ]);
});

test("a transfer requires an eligible target, explicit acceptance, and can be cancelled", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  const principal = t.withIdentity({ subject: "leader-principal" });
  const admin = t.withIdentity({ subject: "leader-admin" });
  const superadmin = t.withIdentity({ subject: "leader-superadmin" });

  await teacher.mutation(api.schedule.markLive, {
    roomName: "transfer-room",
    isLive: true,
  });

  await expect(
    teacher.mutation(api.schedule.requestSessionLeadershipTransfer, {
      roomName: "transfer-room",
      targetUserId: data.teacherId,
    }),
  ).rejects.toThrow("Choose another session leader");
  for (const targetUserId of [
    data.otherTeacherId,
    data.studentId,
    data.outOfScopeAdminId,
  ]) {
    await expect(
      teacher.mutation(api.schedule.requestSessionLeadershipTransfer, {
        roomName: "transfer-room",
        targetUserId,
      }),
    ).rejects.toThrow("cannot lead this class");
  }
  await expect(
    teacher.mutation(api.schedule.requestSessionLeadershipTransfer, {
      roomName: "transfer-room",
      targetUserId: data.inactiveAdminId,
    }),
  ).rejects.toThrow("Target user is unavailable");

  await teacher.mutation(api.schedule.requestSessionLeadershipTransfer, {
    roomName: "transfer-room",
    targetUserId: data.principalId,
  });
  await expect(
    admin.mutation(api.schedule.acceptSessionLeadershipTransfer, {
      roomName: "transfer-room",
    }),
  ).rejects.toThrow("No leadership transfer is pending");
  expect(
    await principal.query(api.schedule.getSessionLeadership, {
      roomName: "transfer-room",
      now: NOW,
    }),
  ).toMatchObject({
    leader: { userId: data.teacherId },
    pendingTransfer: {
      targetUserId: data.principalId,
      requestedByName: "Taylor Teacher",
    },
    viewer: { canAcceptTransfer: true },
  });

  await expect(
    principal.mutation(api.schedule.cancelSessionLeadershipTransfer, {
      roomName: "transfer-room",
    }),
  ).rejects.toThrow("Only the session leader can cancel");
  await principal.mutation(api.schedule.rejectSessionLeadershipTransfer, {
    roomName: "transfer-room",
  });
  expect(
    await teacher.query(api.schedule.getSessionLeadership, {
      roomName: "transfer-room",
      now: NOW,
    }),
  ).toMatchObject({
    pendingTransfer: null,
    latestTransferOutcome: {
      status: "rejected",
      responderName: "Parker Principal",
    },
  });

  const rejectedEvent = await t.run((ctx) =>
    ctx.db
      .query("classSessionLeadershipEvents")
      .withIndex("by_schedule", (q) =>
        q.eq("scheduleId", data.transferScheduleId),
      )
      .order("desc")
      .first(),
  );
  expect(rejectedEvent).toMatchObject({
    eventType: "transfer_rejected",
    actorId: data.principalId,
    leaderId: data.teacherId,
    transferRequestedBy: data.teacherId,
    transferTargetId: data.principalId,
  });

  await teacher.mutation(api.schedule.requestSessionLeadershipTransfer, {
    roomName: "transfer-room",
    targetUserId: data.superadminId,
  });
  await teacher.mutation(api.schedule.cancelSessionLeadershipTransfer, {
    roomName: "transfer-room",
  });
  await teacher.mutation(api.schedule.requestSessionLeadershipTransfer, {
    roomName: "transfer-room",
    targetUserId: data.superadminId,
  });
  await superadmin.mutation(api.schedule.acceptSessionLeadershipTransfer, {
    roomName: "transfer-room",
  });

  expect(
    await teacher.query(api.schedule.getSessionLeadership, {
      roomName: "transfer-room",
      now: NOW,
    }),
  ).toMatchObject({
    latestTransferOutcome: {
      status: "accepted",
      responderName: "Sky Superadmin",
    },
  });

  const schedule = await t.run((ctx) =>
    ctx.db.get("classSchedule", data.transferScheduleId),
  );
  expect(schedule).toMatchObject({
    sessionLeaderId: data.superadminId,
    sessionLeaderRole: "superadmin",
  });
  expect(schedule?.sessionTransferToId).toBeUndefined();
});

test("simultaneous claims produce exactly one session leader", async () => {
  const { t, data } = await setupLeadershipTest();
  await t.run((ctx) =>
    ctx.db.patch("classSchedule", data.concurrentScheduleId, {
      status: "active",
      isLive: true,
      sessionClosureStatus: "pending",
    }),
  );
  const principal = t.withIdentity({ subject: "leader-principal" });
  const admin = t.withIdentity({ subject: "leader-admin" });

  const results = await Promise.allSettled([
    principal.mutation(api.schedule.claimSessionLeadership, {
      roomName: "concurrent-room",
    }),
    admin.mutation(api.schedule.claimSessionLeadership, {
      roomName: "concurrent-room",
    }),
  ]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
  const state = await t.run(async (ctx) => ({
    schedule: await ctx.db.get("classSchedule", data.concurrentScheduleId),
    events: await ctx.db
      .query("classSessionLeadershipEvents")
      .withIndex("by_schedule", (q) =>
        q.eq("scheduleId", data.concurrentScheduleId),
      )
      .collect(),
  }));
  expect([data.principalId, data.adminId]).toContain(
    state.schedule?.sessionLeaderId,
  );
  expect(state.events).toHaveLength(1);
  expect(state.events[0]?.eventType).toBe("claimed");
});

test("only an eligible user can take over after the reconnection grace period", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  const admin = t.withIdentity({ subject: "leader-admin" });
  const otherTeacher = t.withIdentity({ subject: "leader-other-teacher" });
  await teacher.mutation(api.schedule.markLive, {
    roomName: "teacher-led-room",
    isLive: true,
  });
  await t.run((ctx) =>
    ctx.db.patch("classSchedule", data.teacherScheduleId, {
      liveLeaderAbsentSince: NOW,
    }),
  );

  await expect(
    admin.mutation(api.schedule.takeOverSessionLeadership, {
      roomName: "teacher-led-room",
    }),
  ).rejects.toThrow("still responsible");
  vi.setSystemTime(NOW + STUDENT_ONLY_GRACE_MS);
  await expect(
    otherTeacher.mutation(api.schedule.takeOverSessionLeadership, {
      roomName: "teacher-led-room",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await admin.mutation(api.schedule.takeOverSessionLeadership, {
    roomName: "teacher-led-room",
  });

  const schedule = await t.run((ctx) =>
    ctx.db.get("classSchedule", data.teacherScheduleId),
  );
  expect(schedule).toMatchObject({
    sessionLeaderId: data.adminId,
    sessionLeaderRole: "admin",
  });
  const events = await t.run((ctx) =>
    ctx.db
      .query("classSessionLeadershipEvents")
      .withIndex("by_schedule", (q) =>
        q.eq("scheduleId", data.teacherScheduleId),
      )
      .collect(),
  );
  expect(events.at(-1)).toMatchObject({
    eventType: "takeover",
    actorId: data.adminId,
    previousLeaderId: data.teacherId,
  });
});

test("only the current leader can confirm a live extension", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  const admin = t.withIdentity({ subject: "leader-admin" });
  await teacher.mutation(api.schedule.markLive, {
    roomName: "teacher-led-room",
    isLive: true,
  });
  await t.run((ctx) =>
    ctx.db.patch("classSchedule", data.teacherScheduleId, {
      liveDecisionEndsAt: NOW + 60_000,
    }),
  );

  await expect(
    admin.mutation(api.schedule.confirmLiveExtension, {
      roomName: "teacher-led-room",
    }),
  ).rejects.toThrow("Only the session leader can extend this class");
  const extension = await teacher.mutation(api.schedule.confirmLiveExtension, {
    roomName: "teacher-led-room",
  });
  expect(extension.extensionEndsAt).toBe(NOW + 70 * 60_000);
  const schedule = await t.run((ctx) =>
    ctx.db.get("classSchedule", data.teacherScheduleId),
  );
  expect(schedule?.liveDecisionEndsAt).toBeUndefined();
  expect(schedule?.liveExtensionEndsAt).toBe(extension.extensionEndsAt);
});

test("the session leader records taught lessons and verifies every attendance record", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  const principal = t.withIdentity({ subject: "leader-principal" });
  await teacher.mutation(api.schedule.markLive, {
    roomName: "teacher-led-room",
    isLive: true,
  });

  const context = await teacher.query(api.schedule.getSessionClosureContext, {
    roomName: "teacher-led-room",
    now: NOW,
  });
  expect(context).toMatchObject({
    canClose: true,
    lessons: [{ lessonId: data.lessonId, selected: false }],
  });
  expect(context?.attendance).toHaveLength(4);
  expect(context?.attendance).toContainEqual(
    expect.objectContaining({
      studentId: data.studentId,
      status: "absent",
      totalMinutes: 0,
    }),
  );

  await expect(
    principal.mutation(api.schedule.submitSessionClosure, {
      roomName: "teacher-led-room",
      lessonIds: [data.lessonId],
      attendance: buildAttendance(data),
    }),
  ).rejects.toThrow("Only the session leader");

  await teacher.mutation(api.schedule.submitSessionClosure, {
    roomName: "teacher-led-room",
    lessonIds: [data.lessonId],
    notes: "  Reviewed the core examples.  ",
    attendance: buildAttendance(data),
  });

  const saved = await t.run(async (ctx) => {
    const schedule = await ctx.db.get("classSchedule", data.teacherScheduleId);
    const report = await ctx.db
      .query("classSessionReports")
      .withIndex("by_schedule", (q) =>
        q.eq("scheduleId", data.teacherScheduleId),
      )
      .unique();
    const reportLessons = report
      ? await ctx.db
          .query("classSessionReportLessons")
          .withIndex("by_report", (q) => q.eq("reportId", report._id))
          .collect()
      : [];
    const attendance = await ctx.db
      .query("studentAttendanceRecords")
      .withIndex("by_schedule_and_student", (q) =>
        q
          .eq("scheduleId", data.teacherScheduleId)
          .eq("studentId", data.studentId),
      )
      .unique();
    return { schedule, report, reportLessons, attendance };
  });
  expect(saved.schedule).toMatchObject({
    sessionClosureStatus: "completed",
    sessionClosedBy: data.teacherId,
  });
  expect(saved.report).toMatchObject({
    classId: data.classId,
    notes: "Reviewed the core examples.",
  });
  expect(saved.reportLessons).toHaveLength(1);
  expect(saved.reportLessons[0]).toMatchObject({
    classId: data.classId,
    lessonId: data.lessonId,
  });
  expect(saved.attendance).toMatchObject({
    status: "present",
    confirmedBy: data.teacherId,
    lastUpdatedBy: data.teacherId,
  });
});

test("a live class can close without lessons while preserving an optional session comment", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  await teacher.mutation(api.schedule.markLive, {
    roomName: "concurrent-room",
    isLive: true,
  });

  await teacher.mutation(api.schedule.submitSessionClosure, {
    roomName: "concurrent-room",
    lessonIds: [],
    notes: "  We reviewed for the exam.  ",
    attendance: buildAttendance(data),
  });

  const saved = await t.run(async (ctx) => {
    const report = await ctx.db
      .query("classSessionReports")
      .withIndex("by_schedule", (q) =>
        q.eq("scheduleId", data.concurrentScheduleId),
      )
      .unique();
    const reportLessons = report
      ? await ctx.db
          .query("classSessionReportLessons")
          .withIndex("by_report", (q) => q.eq("reportId", report._id))
          .collect()
      : [];
    return { report, reportLessons };
  });
  expect(saved.report).toMatchObject({
    classId: data.classId,
    notes: "We reviewed for the exam.",
  });
  expect(saved.reportLessons).toHaveLength(0);

  const progress = await teacher.query(api.lessons.getClassCurriculumProgress, {
    classId: data.classId,
  });
  expect(progress).toMatchObject({
    totalLessons: 1,
    taughtLessons: 0,
    pendingLessons: 1,
    percentage: 0,
  });
});

test("external class types do not use the Flexidual session closeout", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  await t.run((ctx) =>
    ctx.db.patch("classSchedule", data.teacherScheduleId, {
      sessionType: "ignitia",
    }),
  );

  const context = await teacher.query(api.schedule.getSessionClosureContext, {
    roomName: "teacher-led-room",
    now: NOW,
  });
  expect(context).toBeNull();

  await expect(
    teacher.mutation(api.schedule.submitSessionClosure, {
      roomName: "teacher-led-room",
      lessonIds: [],
      notes: "External platform session",
      attendance: buildAttendance(data),
    }),
  ).rejects.toThrow("External classes do not use session closeout");
});

test("lesson history is scoped to the course and repeated lessons count once in progress", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  const admin = t.withIdentity({ subject: "leader-admin" });
  await t.run((ctx) =>
    ctx.db.insert("lessons", {
      curriculumId: data.curriculumId,
      title: "Still pending",
      order: 2,
      isActive: true,
      createdAt: NOW,
      createdBy: data.adminId,
    }),
  );

  await teacher.mutation(api.schedule.markLive, {
    roomName: "teacher-led-room",
    isLive: true,
  });
  await teacher.mutation(api.schedule.submitSessionClosure, {
    roomName: "teacher-led-room",
    lessonIds: [data.lessonId],
    notes: "First pass",
    attendance: buildAttendance(data),
  });

  vi.setSystemTime(NOW + 1_000);
  const nextContext = await teacher.query(
    api.schedule.getSessionClosureContext,
    { roomName: "tutor-room", now: NOW + 1_000 },
  );
  expect(
    nextContext?.lessons.find(({ lessonId }) => lessonId === data.lessonId),
  ).toMatchObject({
    selected: false,
    previousSessionCount: 1,
    lastRecordedAt: NOW,
  });

  await teacher.mutation(api.schedule.markLive, {
    roomName: "tutor-room",
    isLive: true,
  });
  await teacher.mutation(api.schedule.submitSessionClosure, {
    roomName: "tutor-room",
    lessonIds: [data.lessonId],
    notes: "Second pass",
    attendance: buildAttendance(data),
  });

  const progress = await teacher.query(api.lessons.getClassCurriculumProgress, {
    classId: data.classId,
  });
  expect(progress).toMatchObject({
    totalLessons: 2,
    taughtLessons: 1,
    pendingLessons: 1,
    percentage: 50,
  });
  expect(
    progress?.lessons.find(({ _id }) => _id === data.lessonId),
  ).toMatchObject({
    sessionCount: 2,
    lastTaughtAt: NOW + 1_000,
    status: "taught",
  });

  await expect(
    admin.mutation(api.lessons.remove, { id: data.lessonId }),
  ).rejects.toThrow("RECORDED_LESSON_CANNOT_BE_DELETED");

  await t.run(async (ctx) => {
    const classSchedules = await ctx.db
      .query("classSchedule")
      .withIndex("by_class", (q) => q.eq("classId", data.classId))
      .collect();
    for (const schedule of classSchedules) {
      if (
        schedule._id !== data.teacherScheduleId &&
        schedule._id !== data.tutorScheduleId
      ) {
        await ctx.db.patch("classSchedule", schedule._id, {
          status: "cancelled",
          isLive: false,
        });
      }
    }
    for (const scheduleId of [data.teacherScheduleId, data.tutorScheduleId]) {
      await ctx.db.patch("classSchedule", scheduleId, {
        status: "completed",
        isLive: false,
      });
    }
  });
  const pastClasses = await teacher.query(
    api.recordings.listRecentPastClasses,
    { classId: data.classId, now: NOW + 2 * 60 * 60_000 },
  );
  expect(
    pastClasses.find(({ scheduleId }) => scheduleId === data.teacherScheduleId),
  ).toMatchObject({
    recordedLessons: [
      {
        lessonId: data.lessonId,
        title: "Session leadership",
        order: 1,
      },
    ],
    notes: "First pass",
  });
  expect(
    pastClasses.find(({ scheduleId }) => scheduleId === data.tutorScheduleId),
  ).toMatchObject({
    recordedLessons: [
      {
        lessonId: data.lessonId,
        title: "Session leadership",
        order: 1,
      },
    ],
    notes: "Second pass",
  });
});

test("session closeout rejects invalid lessons and incomplete attendance", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  await teacher.mutation(api.schedule.markLive, {
    roomName: "tutor-room",
    isLive: true,
  });
  const validAttendance = buildAttendance(data);

  for (const lessonIds of [
    [data.lessonId, data.lessonId],
    [data.inactiveLessonId],
    [data.foreignLessonId],
  ]) {
    await expect(
      teacher.mutation(api.schedule.submitSessionClosure, {
        roomName: "tutor-room",
        lessonIds,
        attendance: validAttendance,
      }),
    ).rejects.toThrow();
  }

  const invalidAttendanceSets = [
    [],
    validAttendance.slice(0, 3),
    [validAttendance[0], validAttendance[0], ...validAttendance.slice(2)],
    [
      ...validAttendance.slice(0, 3),
      { studentId: data.otherTeacherId, status: "present" as const },
    ],
  ];
  for (const attendance of invalidAttendanceSets) {
    await expect(
      teacher.mutation(api.schedule.submitSessionClosure, {
        roomName: "tutor-room",
        lessonIds: [data.lessonId],
        attendance,
      }),
    ).rejects.toThrow("Verify the attendance of every enrolled student");
  }

  const state = await t.run(async (ctx) => ({
    schedule: await ctx.db.get("classSchedule", data.tutorScheduleId),
    reports: await ctx.db
      .query("classSessionReports")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", data.tutorScheduleId))
      .collect(),
  }));
  expect(state.schedule?.sessionClosureStatus).toBe("pending");
  expect(state.reports).toHaveLength(0);
});

test("all attendance states persist and a completed report cannot be duplicated", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  const attendance = buildAttendance(data, [
    "present",
    "partial",
    "excused",
    "absent",
  ]);
  await teacher.mutation(api.schedule.markLive, {
    roomName: "end-gate-room",
    isLive: true,
  });
  await teacher.mutation(api.schedule.submitSessionClosure, {
    roomName: "end-gate-room",
    lessonIds: [data.lessonId],
    attendance,
  });

  const savedStatuses = await t.run(async (ctx) =>
    (
      await ctx.db
        .query("studentAttendanceRecords")
        .withIndex("by_schedule", (q) =>
          q.eq("scheduleId", data.endGateScheduleId),
        )
        .collect()
    ).map((session) => ({
      studentId: session.studentId,
      status: session.status,
      markedBy: session.confirmedBy,
      excuseReason: session.excuseReason,
    })),
  );
  for (const record of attendance) {
    expect(savedStatuses).toContainEqual({
      studentId: record.studentId,
      status: record.status,
      markedBy: data.teacherId,
      excuseReason: record.excuseReason,
    });
  }
  await expect(
    teacher.mutation(api.schedule.submitSessionClosure, {
      roomName: "end-gate-room",
      lessonIds: [data.lessonId],
      attendance,
    }),
  ).rejects.toThrow("Only the session leader can close this class");
  const reports = await t.run((ctx) =>
    ctx.db
      .query("classSessionReports")
      .withIndex("by_schedule", (q) =>
        q.eq("scheduleId", data.endGateScheduleId),
      )
      .collect(),
  );
  expect(reports).toHaveLength(1);
});

test("dashboards count final attendance states and keep pending verification separate", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  await teacher.mutation(api.schedule.markLive, {
    roomName: "end-gate-room",
    isLive: true,
  });
  await teacher.mutation(api.schedule.submitSessionClosure, {
    roomName: "end-gate-room",
    lessonIds: [data.lessonId],
    attendance: buildAttendance(data),
  });
  await t.mutation(internal.schedule.endLiveSession, {
    roomName: "end-gate-room",
    endedAt: NOW + 60_000,
    endedBy: data.teacherId,
  });
  await t.mutation(internal.schedule.endLiveSession, {
    roomName: "tutor-room",
    endedAt: NOW + 60_000,
  });

  const expectedStatuses = [
    ["leader-student", "present"],
    ["leader-student-two", "partial"],
    ["leader-student-three", "excused"],
    ["leader-student-four", "absent"],
  ] as const;
  for (const [subject, status] of expectedStatuses) {
    const dashboard = await t
      .withIdentity({ subject })
      .query(api.student.getStudentDashboardStats, { now: NOW + 60_000 });
    expect(dashboard?.overall.verifiedSessions).toBe(1);
    expect(dashboard?.overall.pendingVerification).toBe(1);
    expect(dashboard?.overall.attendanceCounts).toEqual({
      present: status === "present" ? 1 : 0,
      partial: status === "partial" ? 1 : 0,
      absent: status === "absent" ? 1 : 0,
      excused: status === "excused" ? 1 : 0,
    });
  }
});

test("authorized corrections preserve confirmation and record the latest editor", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  const admin = t.withIdentity({ subject: "leader-admin" });
  const otherTeacher = t.withIdentity({ subject: "leader-other-teacher" });
  await teacher.mutation(api.schedule.markLive, {
    roomName: "end-gate-room",
    isLive: true,
  });
  await teacher.mutation(api.schedule.submitSessionClosure, {
    roomName: "end-gate-room",
    lessonIds: [data.lessonId],
    attendance: buildAttendance(data),
  });
  await t.mutation(internal.schedule.endLiveSession, {
    roomName: "end-gate-room",
    endedAt: NOW + 60_000,
    endedBy: data.teacherId,
  });

  await expect(
    otherTeacher.mutation(api.schedule.updateAttendance, {
      scheduleId: data.endGateScheduleId,
      studentId: data.studentId,
      status: "absent",
    }),
  ).rejects.toThrow("Unauthorized");

  vi.setSystemTime(NOW + 120_000);
  await admin.mutation(api.schedule.updateAttendance, {
    scheduleId: data.endGateScheduleId,
    studentId: data.studentId,
    status: "excused",
    excuseReason: "  Family appointment  ",
  });

  const record = await t.run((ctx) =>
    ctx.db
      .query("studentAttendanceRecords")
      .withIndex("by_schedule_and_student", (q) =>
        q
          .eq("scheduleId", data.endGateScheduleId)
          .eq("studentId", data.studentId),
      )
      .unique(),
  );
  expect(record).toMatchObject({
    status: "excused",
    excuseReason: "Family appointment",
    confirmedBy: data.teacherId,
    confirmedAt: NOW,
    lastUpdatedBy: data.adminId,
    lastUpdatedAt: NOW + 120_000,
  });
});

test("authorized leaders can recover a pending closeout after the room ended", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  const student = t.withIdentity({ subject: "leader-student" });
  const outOfScopeAdmin = t.withIdentity({
    subject: "leader-out-of-scope-admin",
  });
  const recoveryCases = [
    {
      roomName: "principal-recovery-room",
      scheduleId: data.principalRecoveryScheduleId,
      actor: t.withIdentity({ subject: "leader-principal" }),
      actorId: data.principalId,
    },
    {
      roomName: "admin-recovery-room",
      scheduleId: data.adminRecoveryScheduleId,
      actor: t.withIdentity({ subject: "leader-admin" }),
      actorId: data.adminId,
    },
    {
      roomName: "superadmin-recovery-room",
      scheduleId: data.superadminRecoveryScheduleId,
      actor: t.withIdentity({ subject: "leader-superadmin" }),
      actorId: data.superadminId,
    },
  ];

  for (const recoveryCase of recoveryCases) {
    await teacher.mutation(api.schedule.markLive, {
      roomName: recoveryCase.roomName,
      isLive: true,
    });
    await t.mutation(internal.schedule.endLiveSession, {
      roomName: recoveryCase.roomName,
      endedAt: NOW + 1_000,
    });

    if (recoveryCase.roomName === "principal-recovery-room") {
      await expect(
        student.mutation(api.schedule.submitSessionClosure, {
          roomName: recoveryCase.roomName,
          lessonIds: [data.lessonId],
          attendance: buildAttendance(data),
        }),
      ).rejects.toThrow("Only the session leader can close this class");
      await expect(
        outOfScopeAdmin.mutation(api.schedule.submitSessionClosure, {
          roomName: recoveryCase.roomName,
          lessonIds: [data.lessonId],
          attendance: buildAttendance(data),
        }),
      ).rejects.toThrow("Only the session leader can close this class");
    }

    const context = await recoveryCase.actor.query(
      api.schedule.getSessionClosureContext,
      { roomName: recoveryCase.roomName, now: NOW + 1_000 },
    );
    expect(context?.canClose).toBe(true);
    await recoveryCase.actor.mutation(api.schedule.submitSessionClosure, {
      roomName: recoveryCase.roomName,
      lessonIds: [data.lessonId],
      attendance: buildAttendance(data),
    });
    const schedule = await t.run((ctx) =>
      ctx.db.get("classSchedule", recoveryCase.scheduleId),
    );
    expect(schedule).toMatchObject({
      status: "completed",
      sessionClosureStatus: "completed",
      sessionClosedBy: recoveryCase.actorId,
    });
  }
});

test("ending is blocked before closeout and finalization records the responsible user", async () => {
  const { t, data } = await setupLeadershipTest();
  const teacher = t.withIdentity({ subject: "leader-teacher" });
  const admin = t.withIdentity({ subject: "leader-admin" });
  await teacher.mutation(api.schedule.markLive, {
    roomName: "teacher-led-room",
    isLive: true,
  });
  await expect(
    admin.action(api.livekit.endSession, {
      roomName: "teacher-led-room",
    }),
  ).rejects.toThrow("Only the session leader can end this class");
  await expect(
    teacher.action(api.livekit.endSession, {
      roomName: "teacher-led-room",
    }),
  ).rejects.toThrow(
    "Complete the lesson and attendance report before ending the class",
  );

  await teacher.mutation(api.schedule.submitSessionClosure, {
    roomName: "teacher-led-room",
    lessonIds: [data.lessonId],
    attendance: buildAttendance(data),
  });
  await t.run((ctx) =>
    ctx.db.insert("class_sessions", {
      scheduleId: data.teacherScheduleId,
      studentId: data.studentId,
      joinedAt: NOW,
      roomName: "teacher-led-room",
      sessionDate: "2026-08-26",
    }),
  );
  await t.mutation(internal.schedule.endLiveSession, {
    roomName: "teacher-led-room",
    endedAt: NOW + 60_000,
    endedBy: data.teacherId,
  });

  const finalState = await t.run(async (ctx) => ({
    schedule: await ctx.db.get("classSchedule", data.teacherScheduleId),
    sessions: await ctx.db
      .query("class_sessions")
      .withIndex("by_schedule", (q) =>
        q.eq("scheduleId", data.teacherScheduleId),
      )
      .collect(),
  }));
  expect(finalState.schedule).toMatchObject({
    status: "completed",
    isLive: false,
    sessionEndedBy: data.teacherId,
  });
  expect(finalState.sessions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        studentId: data.studentId,
        leftAt: NOW + 60_000,
        durationSeconds: 60,
      }),
    ]),
  );
});
