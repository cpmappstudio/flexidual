import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

async function setupUsers() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const users = await t.run(async (ctx) => {
    const firstUserId = await ctx.db.insert("users", {
      clerkId: "notification-first-user",
      firstName: "First",
      lastName: "User",
      fullName: "First User",
      isActive: true,
      createdAt: now,
    });
    const secondUserId = await ctx.db.insert("users", {
      clerkId: "notification-second-user",
      firstName: "Second",
      lastName: "User",
      fullName: "Second User",
      isActive: true,
      createdAt: now,
    });
    return { firstUserId, secondUserId };
  });
  return { t, ...users };
}

test("lists only notifications addressed to the authenticated user", async () => {
  const { t, firstUserId, secondUserId } = await setupUsers();
  await t.mutation(internal.systemNotifications.publish, {
    recipientId: firstUserId,
    kind: "role_changed",
    action: "changed",
    role: "teacher",
    previousRole: "tutor",
    dedupeKey: `role:first:${firstUserId}`,
  });
  await t.mutation(internal.systemNotifications.publish, {
    recipientId: secondUserId,
    kind: "role_changed",
    action: "changed",
    role: "student",
    previousRole: "teacher",
    dedupeKey: `role:second:${secondUserId}`,
  });

  const result = await t
    .withIdentity({ subject: "notification-first-user" })
    .query(api.systemNotifications.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    });

  expect(result.page).toHaveLength(1);
  expect(result.page[0]).toMatchObject({
    recipientId: firstUserId,
    kind: "role_changed",
    role: "teacher",
  });
});

test("deduplicates delivery and tracks read state idempotently", async () => {
  const { t, firstUserId } = await setupUsers();
  const payload = {
    recipientId: firstUserId,
    kind: "class_starting_soon" as const,
    scheduledStart: Date.now() + 5 * 60 * 1000,
    dedupeKey: `starting:${firstUserId}:schedule`,
  };
  const firstId = await t.mutation(
    internal.systemNotifications.publish,
    payload,
  );
  const duplicateId = await t.mutation(
    internal.systemNotifications.publish,
    payload,
  );
  expect(duplicateId).toBe(firstId);

  const asUser = t.withIdentity({ subject: "notification-first-user" });
  expect(await asUser.query(api.systemNotifications.getUnreadCount, {})).toBe(
    1,
  );
  await asUser.mutation(api.systemNotifications.markRead, {
    notificationId: firstId!,
  });
  await asUser.mutation(api.systemNotifications.markRead, {
    notificationId: firstId!,
  });
  expect(await asUser.query(api.systemNotifications.getUnreadCount, {})).toBe(
    0,
  );
});

test("does not let another user mark a notification as read", async () => {
  const { t, firstUserId } = await setupUsers();
  const notificationId = await t.mutation(
    internal.systemNotifications.publish,
    {
      recipientId: firstUserId,
      kind: "course_enrollment",
      action: "added",
      className: "Science",
      dedupeKey: `course:${firstUserId}:science`,
    },
  );

  await t
    .withIdentity({ subject: "notification-second-user" })
    .mutation(api.systemNotifications.markRead, {
      notificationId: notificationId!,
    });

  const notification = await t.run((ctx) =>
    ctx.db.get("systemNotifications", notificationId!),
  );
  expect(notification?.readAt).toBeUndefined();
});

test("publishes one upcoming class notification for students, teacher, and tutor", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const seeded = await t.run(async (ctx) => {
    const createUser = async (clerkId: string, fullName: string) =>
      await ctx.db.insert("users", {
        clerkId,
        firstName: fullName,
        lastName: "User",
        fullName: `${fullName} User`,
        isActive: true,
        createdAt: now,
      });
    const adminId = await createUser("upcoming-admin", "Admin");
    const teacherId = await createUser("upcoming-teacher", "Teacher");
    const tutorId = await createUser("upcoming-tutor", "Tutor");
    const studentId = await createUser("upcoming-student", "Student");
    const schoolId = await ctx.db.insert("schools", {
      name: "Flexidual School",
      slug: "flexidual-school",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Science",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
      schoolId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Science Lab",
      curriculumId,
      teacherId,
      tutorId,
      students: [studentId],
      isActive: true,
      createdAt: now,
      createdBy: adminId,
      schoolId,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "live",
      scheduledStart: now + 4 * 60 * 1000,
      scheduledEnd: now + 64 * 60 * 1000,
      roomName: "science-lab-room",
      status: "scheduled",
      createdAt: now,
      createdBy: adminId,
    });
    await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "live",
      scheduledStart: now + 6 * 60 * 1000,
      scheduledEnd: now + 66 * 60 * 1000,
      roomName: "later-room",
      status: "scheduled",
      createdAt: now,
      createdBy: adminId,
    });
    await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "ignitia",
      scheduledStart: now + 3 * 60 * 1000,
      scheduledEnd: now + 63 * 60 * 1000,
      roomName: "external-room",
      status: "scheduled",
      createdAt: now,
      createdBy: adminId,
    });
    return { scheduleId, studentId, teacherId, tutorId };
  });

  await t.mutation(internal.systemNotifications.publishUpcomingClasses, {
    now,
  });
  await t.mutation(internal.systemNotifications.publishUpcomingClasses, {
    now,
  });

  const notifications = await t.run((ctx) =>
    ctx.db.query("systemNotifications").collect(),
  );
  expect(notifications).toHaveLength(3);
  expect(new Set(notifications.map(({ recipientId }) => recipientId))).toEqual(
    new Set([seeded.studentId, seeded.teacherId, seeded.tutorId]),
  );
  expect(notifications).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        scheduleId: seeded.scheduleId,
        kind: "class_starting_soon",
        className: "Science Lab",
        organizationSlug: "flexidual-school",
        roomName: "science-lab-room",
      }),
    ]),
  );
});

test("publishes course enrollment and teacher assignment changes", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const data = await t.run(async (ctx) => {
    const createUser = async (clerkId: string, fullName: string) =>
      await ctx.db.insert("users", {
        clerkId,
        firstName: fullName,
        lastName: "User",
        fullName: `${fullName} User`,
        isActive: true,
        createdAt: now,
      });
    const adminId = await createUser("course-notification-admin", "Admin");
    const oldTeacherId = await createUser(
      "course-notification-old-teacher",
      "Old Teacher",
    );
    const newTeacherId = await createUser(
      "course-notification-new-teacher",
      "New Teacher",
    );
    const studentId = await createUser(
      "course-notification-student",
      "Student",
    );
    const schoolId = await ctx.db.insert("schools", {
      name: "Course School",
      slug: "course-school",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Course Campus",
      slug: "course-campus",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    await ctx.db.insert("institutionGrades", {
      schoolId,
      code: "08",
      name: "8th Grade",
      order: 8,
      createdAt: now,
      createdBy: adminId,
    });
    const assignRole = async (
      userId: typeof adminId,
      role: "admin" | "teacher" | "student",
      orgType: "school" | "campus",
      orgId: string,
    ) =>
      await ctx.db.insert("roleAssignments", {
        userId,
        orgId,
        orgType,
        role,
        schoolId,
        gradeCode: role === "student" ? "08" : undefined,
        assignedAt: now,
        assignedBy: adminId,
      });
    await assignRole(adminId, "admin", "school", schoolId);
    await assignRole(oldTeacherId, "teacher", "campus", campusId);
    await assignRole(newTeacherId, "teacher", "campus", campusId);
    await assignRole(studentId, "student", "campus", campusId);
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Science",
      gradeCodes: ["08"],
      isActive: true,
      createdAt: now,
      createdBy: adminId,
      schoolId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Course Notifications",
      curriculumId,
      teacherId: oldTeacherId,
      students: [],
      enrollmentsMigratedAt: now,
      gradeCode: "08",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
      schoolId,
      campusId,
    });
    return { classId, studentId, oldTeacherId, newTeacherId };
  });
  const asAdmin = t.withIdentity({ subject: "course-notification-admin" });

  await asAdmin.mutation(api.classes.addStudent, {
    classId: data.classId,
    studentId: data.studentId,
  });
  await asAdmin.mutation(api.classes.removeStudent, {
    classId: data.classId,
    studentId: data.studentId,
  });
  await asAdmin.mutation(api.classes.update, {
    classId: data.classId,
    teacherId: data.newTeacherId,
  });

  const notifications = await t.run((ctx) =>
    ctx.db.query("systemNotifications").collect(),
  );
  expect(notifications).toHaveLength(4);
  expect(notifications).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        recipientId: data.studentId,
        kind: "course_enrollment",
        action: "added",
      }),
      expect.objectContaining({
        recipientId: data.studentId,
        kind: "course_enrollment",
        action: "removed",
      }),
      expect.objectContaining({
        recipientId: data.oldTeacherId,
        kind: "course_assignment",
        action: "removed",
      }),
      expect.objectContaining({
        recipientId: data.newTeacherId,
        kind: "course_assignment",
        action: "added",
      }),
    ]),
  );
});

test("publishes a recording only after it has a playable URL", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const data = await t.run(async (ctx) => {
    const createUser = async (clerkId: string, name: string) =>
      await ctx.db.insert("users", {
        clerkId,
        firstName: name,
        lastName: "User",
        fullName: `${name} User`,
        isActive: true,
        createdAt: now,
      });
    const adminId = await createUser("recording-admin", "Admin");
    const teacherId = await createUser("recording-teacher", "Teacher");
    const studentId = await createUser("recording-student", "Student");
    const schoolId = await ctx.db.insert("schools", {
      name: "Recording School",
      slug: "recording-school",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Media",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
      schoolId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Media Lab",
      curriculumId,
      teacherId,
      students: [studentId],
      isActive: true,
      createdAt: now,
      createdBy: adminId,
      schoolId,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "live",
      scheduledStart: now - 60 * 60 * 1000,
      scheduledEnd: now,
      roomName: "media-lab-room",
      status: "completed",
      completedAt: now,
      createdAt: now,
      createdBy: adminId,
    });
    await ctx.db.insert("recordings", {
      scheduleId,
      roomName: "media-lab-room",
      egressId: "recording-notification-egress",
      status: "active",
      startedAt: now - 60 * 60 * 1000,
    });
    return { teacherId, studentId, scheduleId };
  });

  await t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "recording-notification-egress",
    status: "complete",
  });
  expect(
    await t.run((ctx) => ctx.db.query("systemNotifications").collect()),
  ).toHaveLength(0);

  await t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "recording-notification-egress",
    status: "complete",
    url: "https://recordings.example/media-lab.mp4",
    completedAt: now,
  });
  await t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "recording-notification-egress",
    status: "complete",
    url: "https://recordings.example/media-lab.mp4",
    completedAt: now,
  });

  const notifications = await t.run((ctx) =>
    ctx.db.query("systemNotifications").collect(),
  );
  expect(notifications).toHaveLength(2);
  expect(new Set(notifications.map(({ recipientId }) => recipientId))).toEqual(
    new Set([data.teacherId, data.studentId]),
  );
  expect(notifications[0]).toMatchObject({
    kind: "recording_available",
    className: "Media Lab",
  });

  await t.run((ctx) =>
    ctx.db.insert("recordings", {
      scheduleId: data.scheduleId,
      roomName: "media-lab-room",
      egressId: "failed-recording-egress",
      status: "active",
      startedAt: now,
    }),
  );
  await t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "failed-recording-egress",
    status: "failed",
    error: "S3 upload failed: AccessDenied",
    errorCode: 400,
    details: "End reason: StopEgress API",
  });

  const failedRecording = await t.run((ctx) =>
    ctx.db
      .query("recordings")
      .withIndex("by_egress_id", (q) =>
        q.eq("egressId", "failed-recording-egress"),
      )
      .unique(),
  );
  expect(failedRecording).toMatchObject({
    status: "failed",
    error: "S3 upload failed: AccessDenied",
    errorCode: 400,
    details: "End reason: StopEgress API",
  });
});
